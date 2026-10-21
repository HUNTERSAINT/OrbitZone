import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import {
  BlockUserParams,
  BlockUserResponse,
  SubmitReportBody,
  SubmitReportResponse,
  UnblockUserParams,
} from "@workspace/api-zod";
import {
  blockedUsersTable,
  db,
  matchesTable,
  reportsTable,
  usersTable,
} from "@workspace/db";
import { requireUser } from "../middlewares/require-auth";

const router: IRouter = Router();
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.currentUser!.id,
  message: { error: "Too many reports. Try again later." },
});
const blockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.currentUser!.id,
  message: { error: "Too many block changes. Try again later." },
});

router.post(
  "/reports",
  requireUser,
  reportLimiter,
  async (req, res): Promise<void> => {
    const body = SubmitReportBody.safeParse(req.body);
    if (!body.success || body.data.targetUserId === req.currentUser!.id) {
      res.status(400).json({ error: "Choose a valid member and report reason." });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, body.data.targetUserId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Member not found." });
      return;
    }

    if (body.data.matchId) {
      const [match] = await db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.id, body.data.matchId))
        .limit(1);
      const isParticipant =
        match &&
        (match.userOneId === req.currentUser!.id ||
          match.userTwoId === req.currentUser!.id);
      const expectedTarget =
        match?.userOneId === req.currentUser!.id
          ? match.userTwoId
          : match?.userOneId;
      if (!match || !isParticipant || expectedTarget !== target.id) {
        res.status(404).json({ error: "Chat not found." });
        return;
      }
    }

    const [report] = await db
      .insert(reportsTable)
      .values({
        reporterId: req.currentUser!.id,
        targetUserId: target.id,
        matchId: body.data.matchId ?? null,
        reason: body.data.reason,
        details: body.data.details?.trim() || null,
      })
      .returning({ id: reportsTable.id, status: reportsTable.status });
    if (!report) {
      res.status(500).json({ error: "Report could not be saved." });
      return;
    }
    res.status(201).json(SubmitReportResponse.parse(report));
  },
);

router.post(
  "/users/:userId/block",
  requireUser,
  blockLimiter,
  async (req, res): Promise<void> => {
    const params = BlockUserParams.safeParse(req.params);
    if (!params.success || params.data.userId === req.currentUser!.id) {
      res.status(400).json({ error: "Choose a valid member to block." });
      return;
    }
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, params.data.userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Member not found." });
      return;
    }

    await db
      .insert(blockedUsersTable)
      .values({ userId: req.currentUser!.id, blockedUserId: target.id })
      .onConflictDoNothing();
    res.json(
      BlockUserResponse.parse({
        userId: target.id,
        blocked: true,
      }),
    );
  },
);

router.delete(
  "/users/:userId/block",
  requireUser,
  blockLimiter,
  async (req, res): Promise<void> => {
    const params = UnblockUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Choose a valid member to unblock." });
      return;
    }
    await db
      .delete(blockedUsersTable)
      .where(
        and(
          eq(blockedUsersTable.userId, req.currentUser!.id),
          eq(blockedUsersTable.blockedUserId, params.data.userId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
