import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const blockedUsersTable = pgTable(
  "blocked_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("blocked_users_pair_unique").on(table.userId, table.blockedUserId),
    check("blocked_users_no_self_block", sql`${table.userId} <> ${table.blockedUserId}`),
  ],
);

export type BlockedUser = typeof blockedUsersTable.$inferSelect;
