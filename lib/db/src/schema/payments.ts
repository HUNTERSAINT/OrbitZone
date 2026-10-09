import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const paymentPlanEnum = pgEnum("payment_plan", ["premium", "hookup"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "success", "failed"]);

export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    reference: text("reference").notNull().unique(),
    amountKobo: integer("amount_kobo").notNull(),
    plan: paymentPlanEnum("plan").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("payments_user_created_idx").on(table.userId, table.createdAt),
    index("payments_status_paid_at_idx").on(table.status, table.paidAt),
  ],
);

export type Payment = typeof paymentsTable.$inferSelect;
