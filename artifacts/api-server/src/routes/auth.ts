import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  GetCurrentUserResponse,
  LoginAccountBody,
  LoginAccountResponse,
  RegisterAccountBody,
  RegisterAccountResponse,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/require-auth";
import { ObjectOwnershipError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again later." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

function normalizeIdentifier(value: string): string | null {
  const trimmed = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.length === 13 && digits.startsWith("234")) {
    return `+${digits}`;
  }
  return null;
}

function isAdult(date: Date): boolean {
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < date.getUTCMonth() ||
    (today.getUTCMonth() === date.getUTCMonth() &&
      today.getUTCDate() < date.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age >= 18;
}

export function toSessionUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    area: user.area,
    bio: user.bio,
    photoPaths: user.photoPaths,
    isVerified: user.isVerified,
    verificationSelfieSubmitted: Boolean(user.verificationSelfiePath),
    wantsRelationship: user.wantsRelationship,
    wantsFriendsWithBenefits: user.wantsFriendsWithBenefits,
    wantsHookup: user.wantsHookup,
    premiumUntil: user.premiumUntil?.toISOString() ?? null,
    hookupUntil: user.hookupUntil?.toISOString() ?? null,
  };
}

export async function startUserSession(
  req: Request,
  userId: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.userId = userId;
  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

router.post("/auth/register", registrationLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid registration details." });
    return;
  }

  const input = parsed.data;
  const identifier = normalizeIdentifier(input.identifier);
  if (!identifier) {
    res.status(400).json({
      error: "Enter a valid email address or Nigerian phone number.",
    });
    return;
  }
  if (!isAdult(input.dateOfBirth)) {
    res.status(400).json({ error: "Orbit Zone is only for people aged 18 or older." });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.identifier, identifier))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "That email address or phone number is already registered." });
    return;
  }

  const userId = crypto.randomUUID();
  try {
    for (const path of input.photoPaths) {
      await storage.claimObject(path, userId, "public");
    }
  } catch (error) {
    if (error instanceof ObjectOwnershipError) {
      res.status(400).json({ error: "One or more profile photos cannot be used." });
      return;
    }
    req.log.warn({ err: error }, "Registration photo validation failed");
    res.status(400).json({ error: "Upload each profile photo again and retry." });
    return;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        id: userId,
        identifier,
        passwordHash,
        fullName: input.fullName.trim(),
        gender: input.gender,
        dateOfBirth: input.dateOfBirth.toISOString().slice(0, 10),
        area: input.area.trim(),
        bio: input.bio.trim(),
        photoPaths: input.photoPaths,
        wantsRelationship:
          input.gender === "female" && Boolean(input.wantsRelationship),
        wantsFriendsWithBenefits:
          input.gender === "female" && Boolean(input.wantsFriendsWithBenefits),
        wantsHookup: input.gender === "female" && Boolean(input.wantsHookup),
      })
      .returning();

    await startUserSession(req, user.id);
    res.status(201).json(RegisterAccountResponse.parse(toSessionUser(user)));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "That email address or phone number is already registered." });
      return;
    }
    throw error;
  }
});

router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const parsed = LoginAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login details." });
    return;
  }

  const identifier = normalizeIdentifier(parsed.data.identifier);
  if (!identifier) {
    res.status(401).json({ error: "Invalid email/phone number or password." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.identifier, identifier))
    .limit(1);
  const matches = user
    ? await bcrypt.compare(parsed.data.password, user.passwordHash)
    : false;
  if (!user || !matches) {
    res.status(401).json({ error: "Invalid email/phone number or password." });
    return;
  }

  await startUserSession(req, user.id);
  res.json(LoginAccountResponse.parse(toSessionUser(user)));
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((error) => {
    if (error) {
      req.log.error({ err: error }, "Unable to destroy session during logout");
      res.status(500).json({ error: "Unable to sign out right now." });
      return;
    }
    res.clearCookie("orbitzone.sid", { path: "/" });
    res.sendStatus(204);
  });
});

router.get("/auth/me", requireUser, (req, res): void => {
  res.json(GetCurrentUserResponse.parse(toSessionUser(req.currentUser!)));
});

export default router;
