import { alias, and, count, desc, eq, gte, ilike, or, sql, sum } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AdminOverviewResponse,
  AdminPaymentsResponse,
  AdminReportsResponse,
  AdminUsersResponse,
  GetAdminOverviewResponse,
  GetAdminPaymentsResponse,
  GetAdminReportsQueryParams,
  GetAdminReportsResponse,
  GetAdminUsersQueryParams,
  GetAdminUsersResponse,
  UpdateAdminReportBody,
  UpdateAdminReportParams,
  UpdateAdminReportResponse,
  UpdateAdminUserStatusBody,
  UpdateAdminUserStatusParams,
  UpdateAdminUserStatusResponse,
} from "@workspace/api-zod";
import {
  db,
  paymentsTable,
  reportsTable,
  usersTable,
} from "@workspace/db";
import { requireAdmin, requireUser } from "../middlewares/require-auth";

const router: IRouter = Router();
const reporterTable = alias(usersTable, "reporter");
const targetTable = alias(usersTable, "report_target");

function toAdminUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    identifier: user.identifier,
    fullName: user.fullName,
    gender: user.gender,
    isAdmin: user.isAdmin,
    isBanned: user.isBanned,
    isVerified: user.isVerified,
    verificationSelfieSubmitted: Boolean(user.verificationSelfiePath),
    verificationSelfiePath: user.verificationSelfiePath,
    createdAt: user.createdAt.toISOString(),
    premiumUntil: user.premiumUntil?.toISOString() ?? null,
    hookupUntil: user.hookupUntil?.toISOString() ?? null,
  };
}

async function getReport(reportId: string) {
  const [row] = await db
    .select({
      id: reportsTable.id,
      reporterName: reporterTable.fullName,
      targetName: targetTable.fullName,
      matchId: reportsTable.matchId,
      reason: reportsTable.reason,
      details: reportsTable.details,
      status: reportsTable.status,
      adminNote: reportsTable.adminNote,
      createdAt: reportsTable.createdAt,
      resolvedAt: reportsTable.resolvedAt,
    })
    .from(reportsTable)
    .leftJoin(reporterTable, eq(reportsTable.reporterId, reporterTable.id))
    .leftJoin(targetTable, eq(reportsTable.targetUserId, targetTable.id))
    .where(eq(reportsTable.id, reportId))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

router.get("/admin/overview", requireUser, requireAdmin, async (_req, res): Promise<void> => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [all, men, women, premium, revenue] = await Promise.all([
    db.select({ value: count() }).from(usersTable),
    db.select({ value: count() }).from(usersTable).where(eq(usersTable.gender, "male")),
    db.select({ value: count() }).from(usersTable).where(eq(usersTable.gender, "female")),
    db
      .select({ value: count() })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.gender, "male"),
          gte(usersTable.premiumUntil, new Date()),
        ),
      ),
    db
      .select({ value: sum(paymentsTable.amountKobo) })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.status, "success"),
          gte(paymentsTable.paidAt, weekAgo),
        ),
      ),
  ]);
  res.json(
    GetAdminOverviewResponse.parse({
      totalUsers: Number(all[0]?.value ?? 0),
      maleUsers: Number(men[0]?.value ?? 0),
      femaleUsers: Number(women[0]?.value ?? 0),
      activePremiumUsers: Number(premium[0]?.value ?? 0),
      weeklyRevenueKobo: Number(revenue[0]?.value ?? 0),
    }),
  );
});

router.get("/admin/users", requireUser, requireAdmin, async (req, res): Promise<void> => {
  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid member search." });
    return;
  }
  const search = query.data.search?.trim().replace(/[\\%_]/g, "\\$&");
  const rows = await db
    .select()
    .from(usersTable)
    .where(
      search
        ? or(
            ilike(usersTable.fullName, `%${search}%`),
            ilike(usersTable.identifier, `%${search}%`),
          )
        : undefined,
    )
    .orderBy(desc(usersTable.createdAt))
    .limit(100);
  res.json(
    GetAdminUsersResponse.parse({
      users: rows.map(toAdminUser),
    }),
  );
});

router.patch(
  "/admin/users/:userId/status",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminUserStatusParams.safeParse(req.params);
    const body = UpdateAdminUserStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid account status update." });
      return;
    }
    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    if (target.isAdmin || target.id === req.currentUser!.id) {
      res.status(403).json({ error: "Admin accounts cannot be banned here." });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({ isBanned: body.data.isBanned })
      .where(eq(usersTable.id, target.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.json(UpdateAdminUserStatusResponse.parse(toAdminUser(updated)));
  },
);

router.get(
  "/admin/reports",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const query = GetAdminReportsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid report filter." });
      return;
    }
    const where =
      query.data.status === "all"
        ? sql`true`
        : eq(reportsTable.status, query.data.status);
    const rows = await db
      .select({
        id: reportsTable.id,
        reporterName: reporterTable.fullName,
        targetName: targetTable.fullName,
        matchId: reportsTable.matchId,
        reason: reportsTable.reason,
        details: reportsTable.details,
        status: reportsTable.status,
        adminNote: reportsTable.adminNote,
        createdAt: reportsTable.createdAt,
        resolvedAt: reportsTable.resolvedAt,
      })
      .from(reportsTable)
      .leftJoin(reporterTable, eq(reportsTable.reporterId, reporterTable.id))
      .leftJoin(targetTable, eq(reportsTable.targetUserId, targetTable.id))
      .where(where)
      .orderBy(desc(reportsTable.createdAt))
      .limit(200);
    res.json(
      GetAdminReportsResponse.parse({
        reports: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          resolvedAt: row.resolvedAt?.toISOString() ?? null,
        })),
      }),
    );
  },
);

router.patch(
  "/admin/reports/:reportId",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminReportParams.safeParse(req.params);
    const body = UpdateAdminReportBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid report update." });
      return;
    }
    const resolved = body.data.status === "resolved";
    const [updated] = await db
      .update(reportsTable)
      .set({
        status: body.data.status,
        adminNote: body.data.adminNote?.trim() || null,
        resolvedById: resolved ? req.currentUser!.id : null,
        resolvedAt: resolved ? new Date() : null,
      })
      .where(eq(reportsTable.id, params.data.reportId))
      .returning({ id: reportsTable.id });
    if (!updated) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    const report = await getReport(updated.id);
    if (!report) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    res.json(UpdateAdminReportResponse.parse(report));
  },
);

router.get(
  "/admin/payments",
  requireUser,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        id: paymentsTable.id,
        reference: paymentsTable.reference,
        userIdentifier: usersTable.identifier,
        amountKobo: paymentsTable.amountKobo,
        plan: paymentsTable.plan,
        status: paymentsTable.status,
        createdAt: paymentsTable.createdAt,
        paidAt: paymentsTable.paidAt,
      })
      .from(paymentsTable)
      .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(200);
    res.json(
      GetAdminPaymentsResponse.parse({
        payments: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          paidAt: row.paidAt?.toISOString() ?? null,
        })),
      }),
    );
  },
);

export default router;
