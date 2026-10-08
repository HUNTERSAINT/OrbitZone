import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const swipeActionEnum = pgEnum("swipe_action", ["like", "pass"]);

export const swipesTable = pgTable(
  "swipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    action: swipeActionEnum("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("swipes_from_to_unique").on(table.fromUserId, table.toUserId),
    index("swipes_to_user_idx").on(table.toUserId),
    check("swipes_no_self_swipe", sql`${table.fromUserId} <> ${table.toUserId}`),
  ],
);

export type Swipe = typeof swipesTable.$inferSelect;
