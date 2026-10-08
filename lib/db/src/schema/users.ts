import {
  boolean,
  date,
  index,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userGenderEnum = pgEnum("user_gender", ["male", "female"]);

export const usersTable = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  gender: userGenderEnum("gender").notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  area: text("area").notNull(),
  bio: text("bio").notNull().default(""),
  photoPaths: text("photo_paths").array().notNull().default(sql`ARRAY[]::text[]`),
  verificationSelfiePath: text("verification_selfie_path"),
  isVerified: boolean("is_verified").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  wantsRelationship: boolean("wants_relationship").notNull().default(false),
  wantsFriendsWithBenefits: boolean("wants_friends_with_benefits").notNull().default(false),
  wantsHookup: boolean("wants_hookup").notNull().default(false),
  acceptsTermsAt: timestamp("accepts_terms_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  acceptsPrivacyAt: timestamp("accepts_privacy_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userSessionsTable = pgTable(
  "user_sessions",
  {
    sid: text("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (table) => [index("user_sessions_expire_idx").on(table.expire)],
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type UserSession = typeof userSessionsTable.$inferSelect;
