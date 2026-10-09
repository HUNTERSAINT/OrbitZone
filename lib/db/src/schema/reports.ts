import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { matchesTable } from "./matches";
import { usersTable } from "./users";

export const reportReasonEnum = pgEnum("report_reason", [
  "fake_profile",
  "harassment",
  "scam",
  "underage",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status", ["open", "resolved"]);

export const reportsTable = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id").references(() => usersTable.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    matchId: uuid("match_id").references(() => matchesTable.id, { onDelete: "set null" }),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("open"),
    adminNote: text("admin_note"),
    resolvedById: uuid("resolved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("reports_status_created_idx").on(table.status, table.createdAt),
    index("reports_target_user_created_idx").on(table.targetUserId, table.createdAt),
  ],
);

export type Report = typeof reportsTable.$inferSelect;
