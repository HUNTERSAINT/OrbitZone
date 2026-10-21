import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const identifier = "admin@orbitzone.test";
const password = process.env.ORBITZONE_ADMIN_PASSWORD;

if (process.env.NODE_ENV !== "production" || process.env.ALLOW_ADMIN_SEED !== "true") {
  throw new Error(
    "Admin seeding is a one-time production operation. Set ALLOW_ADMIN_SEED=true to continue.",
  );
}
if (!password || password.length < 12) {
  throw new Error("Set ORBITZONE_ADMIN_PASSWORD to a value of at least 12 characters.");
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const [existing] = await db
    .select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.identifier, identifier))
    .limit(1);

  if (existing && !existing.isAdmin) {
    throw new Error(
      "The admin login identifier already belongs to a non-admin account; no changes were made.",
    );
  }

  if (existing) {
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, existing.id));
    console.info("Admin password updated.");
  } else {
    await db.insert(usersTable).values({
      identifier,
      passwordHash,
      fullName: "Orbit Zone Safety",
      gender: "female",
      dateOfBirth: "1988-03-18",
      area: "Lokoja",
      bio: "Orbit Zone safety and community account.",
      photoPaths: [],
      isAdmin: true,
    });
    console.info("Admin account created.");
  }
} finally {
  await db.$client.end();
}
