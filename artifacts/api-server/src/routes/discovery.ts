import { and, count, eq, gte, min, notExists, or, sql } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import {
  blockedUsersTable,
  db,
  matchesTable,
  swipesTable,
  usersTable,
} from "@workspace/db";
import {
  GetDiscoveryFeedResponse,
  FreeLikeLimitError,
  RecordSwipeBody,
  RecordSwipeParams,
  RecordSwipeResponse,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/require-auth";

const router: IRouter = Router();
const FREE_LIKE_LIMIT = 5;
const FREE_LIKE_WINDOW_MS = 48 * 60 * 60 * 1000;
const swipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many swipe actions. Try again later." },
});

async function getFreeLikeQuota(userId: string) {
  const since = new Date(Date.now() - FREE_LIKE_WINDOW_MS);
  const [usage] = await db
    .select({
      used: count(),
      earliestLikeAt: min(swipesTable.createdAt),
    })
    .from(swipesTable)
    .where(
      and(
        eq(swipesTable.fromUserId, userId),
        eq(swipesTable.action, "like"),
        gte(swipesTable.createdAt, since),
      ),
    );
  const used = Number(usage?.used ?? 0);
  const resetsAt =
    used >= FREE_LIKE_LIMIT && usage?.earliestLikeAt
      ? new Date(usage.earliestLikeAt.getTime() + FREE_LIKE_WINDOW_MS).toISOString()
      : null;
  return {
    limit: FREE_LIKE_LIMIT,
    remaining: Math.max(0, FREE_LIKE_LIMIT - used),
    resetsAt,
  };
}

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

function canonicalPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

router.get("/feed", requireUser, async (req, res): Promise<void> => {
  const viewer = req.currentUser!;
  const oppositeGender = viewer.gender === "male" ? "female" : "male";
  const unseenSwipe = db
    .select({ id: swipesTable.id })
    .from(swipesTable)
    .where(
      and(
        eq(swipesTable.fromUserId, viewer.id),
        eq(swipesTable.toUserId, usersTable.id),
      ),
    );
  const blockedPair = db
    .select({ id: blockedUsersTable.id })
    .from(blockedUsersTable)
    .where(
      or(
        and(
          eq(blockedUsersTable.userId, viewer.id),
          eq(blockedUsersTable.blockedUserId, usersTable.id),
        ),
        and(
          eq(blockedUsersTable.userId, usersTable.id),
          eq(blockedUsersTable.blockedUserId, viewer.id),
        ),
      ),
    );

  const filters = [
    eq(usersTable.gender, oppositeGender),
    eq(usersTable.isBanned, false),
    sql`cardinality(${usersTable.photoPaths}) > 0`,
    notExists(unseenSwipe),
    notExists(blockedPair),
  ];

  if (viewer.gender === "male") {
    filters.push(
      or(
        eq(usersTable.wantsRelationship, true),
        eq(usersTable.wantsFriendsWithBenefits, true),
      )!,
    );
  }

  const profiles = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      dateOfBirth: usersTable.dateOfBirth,
      gender: usersTable.gender,
      area: usersTable.area,
      bio: usersTable.bio,
      photoPaths: usersTable.photoPaths,
      isVerified: usersTable.isVerified,
    })
    .from(usersTable)
    .where(and(...filters))
    .orderBy(sql`random()`)
    .limit(20);

  const freeLikeQuota =
    viewer.gender === "male" &&
    (!viewer.premiumUntil || viewer.premiumUntil.getTime() <= Date.now())
      ? await getFreeLikeQuota(viewer.id)
      : null;

  res.json(
    GetDiscoveryFeedResponse.parse({
      freeLikeQuota,
      profiles: profiles.map((profile) => ({
        id: profile.id,
        fullName: profile.fullName,
        age: ageOnDate(profile.dateOfBirth),
        gender: profile.gender,
        area: profile.area,
        bio: profile.bio,
        photoPath: profile.photoPaths[0],
        isVerified: profile.isVerified,
      })),
    }),
  );
});

router.post(
  "/swipes/:profileId",
  requireUser,
  swipeLimiter,
  async (req, res): Promise<void> => {
    const params = RecordSwipeParams.safeParse(req.params);
    const body = RecordSwipeBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Choose a valid profile and like or pass action." });
      return;
    }

    const viewer = req.currentUser!;
    const profileId = params.data.profileId;
    if (profileId === viewer.id) {
      res.status(400).json({ error: "You cannot swipe on your own profile." });
      return;
    }

    const [profile] = await db
      .select({
        id: usersTable.id,
        gender: usersTable.gender,
        isBanned: usersTable.isBanned,
        photoPaths: usersTable.photoPaths,
        wantsRelationship: usersTable.wantsRelationship,
        wantsFriendsWithBenefits: usersTable.wantsFriendsWithBenefits,
      })
      .from(usersTable)
      .where(eq(usersTable.id, profileId))
      .limit(1);

    if (
      !profile ||
      profile.isBanned ||
      profile.gender === viewer.gender ||
      profile.photoPaths.length === 0 ||
      (viewer.gender === "male" &&
        !profile.wantsRelationship &&
        !profile.wantsFriendsWithBenefits)
    ) {
      res.status(404).json({ error: "Profile is not available for discovery." });
      return;
    }

    const [blocked] = await db
      .select({ id: blockedUsersTable.id })
      .from(blockedUsersTable)
      .where(
        or(
          and(
            eq(blockedUsersTable.userId, viewer.id),
            eq(blockedUsersTable.blockedUserId, profile.id),
          ),
          and(
            eq(blockedUsersTable.userId, profile.id),
            eq(blockedUsersTable.blockedUserId, viewer.id),
          ),
        ),
      )
      .limit(1);
    if (blocked) {
      res.status(404).json({ error: "Profile is not available for discovery." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      let premiumActive = false;
      if (body.data.action === "like" && viewer.gender === "male") {
        const [account] = await tx
          .select({ premiumUntil: usersTable.premiumUntil })
          .from(usersTable)
          .where(eq(usersTable.id, viewer.id))
          .for("update")
          .limit(1);
        premiumActive = Boolean(
          account?.premiumUntil && account.premiumUntil.getTime() > Date.now(),
        );
      }

      const [existingSwipe] = await tx
        .select({ action: swipesTable.action })
        .from(swipesTable)
        .where(
          and(
            eq(swipesTable.fromUserId, viewer.id),
            eq(swipesTable.toUserId, profile.id),
          ),
        )
        .limit(1);
      if (existingSwipe && existingSwipe.action !== body.data.action) {
        return { kind: "conflict" as const };
      }

      if (!existingSwipe) {
        if (
          body.data.action === "like" &&
          viewer.gender === "male" &&
          !premiumActive
        ) {
          const since = new Date(Date.now() - FREE_LIKE_WINDOW_MS);
          const [usage] = await tx
            .select({
              used: count(),
              earliestLikeAt: min(swipesTable.createdAt),
            })
            .from(swipesTable)
            .where(
              and(
                eq(swipesTable.fromUserId, viewer.id),
                eq(swipesTable.action, "like"),
                gte(swipesTable.createdAt, since),
              ),
            );
          const used = Number(usage?.used ?? 0);
          if (used >= FREE_LIKE_LIMIT) {
            const resetsAt = usage?.earliestLikeAt
              ? new Date(
                  usage.earliestLikeAt.getTime() + FREE_LIKE_WINDOW_MS,
                ).toISOString()
              : new Date(Date.now() + FREE_LIKE_WINDOW_MS).toISOString();
            return { kind: "limit" as const, resetsAt };
          }
        }

        await tx
          .insert(swipesTable)
          .values({
            fromUserId: viewer.id,
            toUserId: profile.id,
            action: body.data.action,
          })
          .onConflictDoNothing();

        const [recordedSwipe] = await tx
          .select({ action: swipesTable.action })
          .from(swipesTable)
          .where(
            and(
              eq(swipesTable.fromUserId, viewer.id),
              eq(swipesTable.toUserId, profile.id),
            ),
          )
          .limit(1);
        if (recordedSwipe && recordedSwipe.action !== body.data.action) {
          return { kind: "conflict" as const };
        }
      }

      let matched = false;
      let matchId: string | null = null;
      if (body.data.action === "like") {
        const [reciprocalLike] = await tx
          .select({ id: swipesTable.id })
          .from(swipesTable)
          .where(
            and(
              eq(swipesTable.fromUserId, profile.id),
              eq(swipesTable.toUserId, viewer.id),
              eq(swipesTable.action, "like"),
            ),
          )
          .limit(1);

        if (reciprocalLike) {
          const [userOneId, userTwoId] = canonicalPair(viewer.id, profile.id);
          await tx
            .insert(matchesTable)
            .values({ userOneId, userTwoId })
            .onConflictDoNothing();
          const [match] = await tx
            .select({ id: matchesTable.id })
            .from(matchesTable)
            .where(
              and(
                eq(matchesTable.userOneId, userOneId),
                eq(matchesTable.userTwoId, userTwoId),
              ),
            )
            .limit(1);
          if (match) {
            matched = true;
            matchId = match.id;
          }
        }
      }

      return { kind: "ok" as const, matched, matchId };
    });

    if (result.kind === "conflict") {
      res.status(409).json({ error: "A different swipe was already recorded." });
      return;
    }
    if (result.kind === "limit") {
      res.status(403).json(
        FreeLikeLimitError.parse({
          error: "Your five free likes have been used. Upgrade to Premium or wait for the next like to reset.",
          limit: FREE_LIKE_LIMIT,
          resetsAt: result.resetsAt,
        }),
      );
      return;
    }

    res.json(
      RecordSwipeResponse.parse({
        action: body.data.action,
        matched: result.matched,
        matchId: result.matchId,
      }),
    );
  },
);

export default router;
