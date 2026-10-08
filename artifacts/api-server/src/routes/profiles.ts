import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  GetMyProfileResponse,
  SubmitVerificationSelfieBody,
  SubmitVerificationSelfieResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/require-auth";
import { toSessionUser } from "./auth";
import { ObjectOwnershipError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

function isAdult(date: Date): boolean {
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  if (
    today.getUTCMonth() < date.getUTCMonth() ||
    (today.getUTCMonth() === date.getUTCMonth() &&
      today.getUTCDate() < date.getUTCDate())
  ) {
    age -= 1;
  }
  return age >= 18;
}

router.get("/profiles/me", requireUser, (req, res): void => {
  res.json(GetMyProfileResponse.parse(toSessionUser(req.currentUser!)));
});

router.patch("/profiles/me", requireUser, async (req, res): Promise<void> => {
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile details." });
    return;
  }

  const input = parsed.data;
  if (input.dateOfBirth && !isAdult(input.dateOfBirth)) {
    res.status(400).json({ error: "Orbit Zone is only for people aged 18 or older." });
    return;
  }

  if (input.photoPaths) {
    try {
      for (const path of input.photoPaths) {
        await storage.claimObject(path, req.currentUser!.id, "public");
      }
    } catch (error) {
      if (error instanceof ObjectOwnershipError) {
        res.status(400).json({ error: "One or more profile photos cannot be used." });
        return;
      }
      req.log.warn({ err: error }, "Profile photo validation failed");
      res.status(400).json({ error: "Upload each profile photo again and retry." });
      return;
    }
  }

  const patch: Partial<typeof usersTable.$inferInsert> = {};
  if (input.fullName !== undefined) patch.fullName = input.fullName.trim();
  if (input.gender !== undefined) patch.gender = input.gender;
  if (input.dateOfBirth !== undefined) {
    patch.dateOfBirth = input.dateOfBirth.toISOString().slice(0, 10);
  }
  if (input.area !== undefined) patch.area = input.area.trim();
  if (input.bio !== undefined) patch.bio = input.bio.trim();
  if (input.photoPaths !== undefined) patch.photoPaths = input.photoPaths;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Provide at least one profile field to update." });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(patch)
    .where(eq(usersTable.id, req.currentUser!.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  res.json(UpdateMyProfileResponse.parse(toSessionUser(user)));
});

router.post(
  "/profiles/me/verification-selfie",
  requireUser,
  async (req, res): Promise<void> => {
    const parsed = SubmitVerificationSelfieBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Submit a valid selfie image." });
      return;
    }

    try {
      await storage.claimObject(parsed.data.selfiePath, req.currentUser!.id, "private");
    } catch (error) {
      if (error instanceof ObjectOwnershipError) {
        res.status(400).json({ error: "That selfie cannot be used." });
        return;
      }
      req.log.warn({ err: error }, "Verification selfie validation failed");
      res.status(400).json({ error: "Upload the selfie again and retry." });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set({ verificationSelfiePath: parsed.data.selfiePath, isVerified: false })
      .where(eq(usersTable.id, req.currentUser!.id))
      .returning();
    if (!user) {
      res.status(404).json({ error: "Profile not found." });
      return;
    }
    res.json(SubmitVerificationSelfieResponse.parse(toSessionUser(user)));
  },
);

router.delete("/account", requireUser, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const objectPaths = [
    ...user.photoPaths,
    ...(user.verificationSelfiePath ? [user.verificationSelfiePath] : []),
  ];

  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
  await db.delete(usersTable).where(eq(usersTable.id, user.id));
  res.clearCookie("confluence.sid", { path: "/api" });

  await Promise.all(
    objectPaths.map(async (path) => {
      try {
        await storage.deleteObject(path);
      } catch (error) {
        req.log.warn({ err: error, userId: user.id }, "Failed to remove an account image");
      }
    }),
  );
  res.sendStatus(204);
});

export default router;
