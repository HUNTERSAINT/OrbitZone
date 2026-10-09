import { and, eq, notExists, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { SearchProfilesResponse } from "@workspace/api-zod";
import { blockedUsersTable, db, usersTable } from "@workspace/db";
import { requirePremiumForMen, requireUser } from "../middlewares/require-auth";

const router: IRouter = Router();
type SearchCategory = "relationship" | "friends-with-benefits" | "hookup";

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

router.get("/search", requireUser, requirePremiumForMen, async (req, res): Promise<void> => {
  const viewer = req.currentUser!;
  if (viewer.gender !== "male") {
    res.status(403).json({ error: "Search is available to men only." });
    return;
  }

  const rawCategory = req.query.category;
  const categories: SearchCategory[] = [
    "relationship",
    "friends-with-benefits",
    "hookup",
  ];
  if (typeof rawCategory !== "string" || !categories.includes(rawCategory as SearchCategory)) {
    res.status(400).json({ error: "Choose a valid search category." });
    return;
  }
  const category = rawCategory as SearchCategory;
  const parseAge = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) return null;
    const age = Number(value);
    return age >= 18 && age <= 100 ? age : null;
  };
  const minAge = parseAge(req.query.minAge, 18);
  const maxAge = parseAge(req.query.maxAge, 100);
  if (minAge === null || maxAge === null || minAge > maxAge) {
    res.status(400).json({ error: "Choose a valid age range from 18 to 100." });
    return;
  }

  if (
    category === "hookup" &&
    (!viewer.hookupUntil || viewer.hookupUntil.getTime() <= Date.now())
  ) {
    res.status(403).json({ error: "upgrade required" });
    return;
  }

  const area =
    typeof req.query.area === "string"
      ? req.query.area.trim().replace(/[%_]/g, "").slice(0, 80)
      : "";
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

  const categoryPreference =
    category === "relationship"
      ? eq(usersTable.wantsRelationship, true)
      : category === "friends-with-benefits"
        ? eq(usersTable.wantsFriendsWithBenefits, true)
        : eq(usersTable.wantsHookup, true);
  const filters = [
    eq(usersTable.gender, "female"),
    eq(usersTable.isBanned, false),
    categoryPreference,
    sql`cardinality(${usersTable.photoPaths}) > 0`,
    notExists(blockedPair),
  ];
  if (area) filters.push(sql`lower(${usersTable.area}) like ${`%${area.toLowerCase()}%`}`);

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
    .limit(100);

  res.json(
    SearchProfilesResponse.parse({
      category,
      profiles: profiles
        .map((profile) => ({
          id: profile.id,
          fullName: profile.fullName,
          age: ageOnDate(profile.dateOfBirth),
          gender: profile.gender,
          area: profile.area,
          bio: profile.bio,
          photoPath: profile.photoPaths[0],
          isVerified: profile.isVerified,
        }))
        .filter((profile) => profile.age >= minAge && profile.age <= maxAge),
    }),
  );
});

export default router;
