import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { matchesTable } from "./matches";
import { usersTable } from "./users";

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matchesTable.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_match_created_idx").on(table.matchId, table.createdAt),
    index("messages_sender_idx").on(table.senderId),
  ],
);

export type Message = typeof messagesTable.$inferSelect;
