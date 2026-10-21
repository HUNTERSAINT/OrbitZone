import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const matchesTable = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userOneId: uuid("user_one_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    userTwoId: uuid("user_two_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    userOneLastReadAt: timestamp("user_one_last_read_at", { withTimezone: true }),
    userTwoLastReadAt: timestamp("user_two_last_read_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("matches_pair_unique").on(table.userOneId, table.userTwoId),
    index("matches_user_one_idx").on(table.userOneId),
    index("matches_user_two_idx").on(table.userTwoId),
    check("matches_canonical_pair", sql`${table.userOneId} < ${table.userTwoId}`),
  ],
);

export type Match = typeof matchesTable.$inferSelect;
