import { and, count, desc, eq, gt, not, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import type { Server } from "socket.io";
import {
  GetFullProfileParams,
  GetFullProfileResponse,
  GetMatchMessagesParams,
  GetMatchMessagesResponse,
  GetMatchesResponse,
  MarkMatchReadParams,
  SendMatchMessageBody,
  SendMatchMessageParams,
  SendMatchMessageResponse,
} from "@workspace/api-zod";
import {
  blockedUsersTable,
  db,
  matchesTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import {
  requirePremiumForMen,
  requireUser,
} from "../middlewares/require-auth";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function ageOnDate(dateOfBirth: string): number {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const today = new Date();
  let age = today.getUTCFullYear() - year;
  if (
    today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)
  ) {
    age -= 1;
  }
  return age;
}

async function isBlockedPair(userId: string, otherUserId: string): Promise<boolean> {
  const [block] = await db
    .select({ id: blockedUsersTable.id })
    .from(blockedUsersTable)
    .where(
      or(
        and(
          eq(blockedUsersTable.userId, userId),
          eq(blockedUsersTable.blockedUserId, otherUserId),
        ),
        and(
          eq(blockedUsersTable.userId, otherUserId),
          eq(blockedUsersTable.blockedUserId, userId),
        ),
      ),
    )
    .limit(1);
  return Boolean(block);
}

async function getMatchForUser(matchId: string, userId: string) {
  const [match] = await db
    .select()
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.id, matchId),
        or(
          eq(matchesTable.userOneId, userId),
          eq(matchesTable.userTwoId, userId),
        ),
      ),
    )
    .limit(1);
  return match ?? null;
}

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.currentUser!.id,
  message: { error: "Too many messages. Try again in a minute." },
});

router.get(
  "/profiles/:profileId",
  requireUser,
  requirePremiumForMen,
  async (req, res): Promise<void> => {
    const params = GetFullProfileParams.safeParse(req.params);
    if (!params.success || params.data.profileId === req.currentUser!.id) {
      res.status(404).json({ error: "Profile is unavailable." });
      return;
    }

    const [profile] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.profileId))
      .limit(1);
    if (
      !profile ||
      profile.isBanned ||
      (await isBlockedPair(req.currentUser!.id, profile.id))
    ) {
      res.status(404).json({ error: "Profile is unavailable." });
      return;
    }

    res.json(
      GetFullProfileResponse.parse({
        id: profile.id,
        fullName: profile.fullName,
        age: ageOnDate(profile.dateOfBirth),
        gender: profile.gender,
        area: profile.area,
        bio: profile.bio,
        photoPaths: profile.photoPaths,
        isVerified: profile.isVerified,
      }),
    );
  },
);

router.get("/matches", requireUser, requirePremiumForMen, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const matches = await db
    .select()
    .from(matchesTable)
    .where(
      or(
        eq(matchesTable.userOneId, user.id),
        eq(matchesTable.userTwoId, user.id),
      ),
    )
    .orderBy(desc(matchesTable.lastMessageAt), desc(matchesTable.createdAt))
    .limit(100);

  const result = [];
  for (const match of matches) {
    const otherId =
      match.userOneId === user.id ? match.userTwoId : match.userOneId;
    if (await isBlockedPair(user.id, otherId)) continue;
    const [profile] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, otherId), eq(usersTable.isBanned, false)))
      .limit(1);
    if (!profile) continue;

    const [lastMessage] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.matchId, match.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);
    const readAt =
      match.userOneId === user.id
        ? match.userOneLastReadAt
        : match.userTwoLastReadAt;
    const [unread] = await db
      .select({ value: count() })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.matchId, match.id),
          not(eq(messagesTable.senderId, user.id)),
          gt(messagesTable.createdAt, readAt ?? new Date(0)),
        ),
      );

    result.push({
      id: match.id,
      profile: {
        id: profile.id,
        fullName: profile.fullName,
        age: ageOnDate(profile.dateOfBirth),
        gender: profile.gender,
        area: profile.area,
        bio: profile.bio,
        photoPath: profile.photoPaths[0] ?? "",
        isVerified: profile.isVerified,
      },
      lastMessage: lastMessage?.body ?? null,
      lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
      unreadCount: Number(unread?.value ?? 0),
    });
  }

  res.json(GetMatchesResponse.parse({ matches: result }));
});

router.get(
  "/matches/:matchId/messages",
  requireUser,
  requirePremiumForMen,
  async (req, res): Promise<void> => {
    const params = GetMatchMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Match not found or unavailable." });
      return;
    }
    const match = await getMatchForUser(params.data.matchId, req.currentUser!.id);
    if (
      !match ||
      (await isBlockedPair(
        req.currentUser!.id,
        match.userOneId === req.currentUser!.id ? match.userTwoId : match.userOneId,
      ))
    ) {
      res.status(404).json({ error: "Match not found or unavailable." });
      return;
    }

    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.matchId, match.id))
      .orderBy(messagesTable.createdAt)
      .limit(500);
    res.json(
      GetMatchMessagesResponse.parse({
        messages: messages.map((message) => ({
          id: message.id,
          matchId: message.matchId,
          senderId: message.senderId,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
        })),
      }),
    );
  },
);

router.post(
  "/matches/:matchId/messages",
  requireUser,
  requirePremiumForMen,
  messageLimiter,
  async (req, res): Promise<void> => {
    const params = SendMatchMessageParams.safeParse(req.params);
    const body = SendMatchMessageBody.safeParse(req.body);
    const messageText = body.success ? body.data.body.trim() : "";
    if (!params.success || !body.success || !messageText) {
      res.status(400).json({ error: "Enter a message with 1 to 2,000 characters." });
      return;
    }
    const user = req.currentUser!;
    const match = await getMatchForUser(params.data.matchId, user.id);
    if (!match) {
      res.status(404).json({ error: "Match not found or unavailable." });
      return;
    }
    const otherId = match.userOneId === user.id ? match.userTwoId : match.userOneId;
    const [otherUser] = await db
      .select({ id: usersTable.id, isBanned: usersTable.isBanned })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);
    if (!otherUser || otherUser.isBanned || (await isBlockedPair(user.id, otherId))) {
      res.status(404).json({ error: "Match not found or unavailable." });
      return;
    }

    const [saved] = await db
      .insert(messagesTable)
      .values({ matchId: match.id, senderId: user.id, body: messageText })
      .returning();
    if (!saved) {
      res.status(500).json({ error: "Message could not be saved." });
      return;
    }
    await db
      .update(matchesTable)
      .set({ lastMessageAt: saved.createdAt })
      .where(eq(matchesTable.id, match.id));

    const response = SendMatchMessageResponse.parse({
      id: saved.id,
      matchId: saved.matchId,
      senderId: saved.senderId,
      body: saved.body,
      createdAt: saved.createdAt.toISOString(),
    });
    const io = req.app.get("io") as Server;
    io.to(`user:${user.id}`).emit("message:new", response);
    io.to(`user:${otherId}`).emit("message:new", response);
    io.to(`user:${user.id}`).emit("match:updated", { matchId: match.id });
    io.to(`user:${otherId}`).emit("match:updated", { matchId: match.id });
    res.status(201).json(response);
  },
);

router.post(
  "/matches/:matchId/read",
  requireUser,
  requirePremiumForMen,
  async (req, res): Promise<void> => {
    const params = MarkMatchReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ error: "Match not found or unavailable." });
      return;
    }
    const user = req.currentUser!;
    const match = await getMatchForUser(params.data.matchId, user.id);
    if (!match) {
      res.status(404).json({ error: "Match not found or unavailable." });
      return;
    }
    const now = new Date();
    await db
      .update(matchesTable)
      .set(
        match.userOneId === user.id
          ? { userOneLastReadAt: now }
          : { userTwoLastReadAt: now },
      )
      .where(eq(matchesTable.id, match.id));
    res.sendStatus(204);
  },
);

export default router;
