import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";

const adminPassword = process.env.ORBITZONE_ADMIN_PASSWORD;
const demoPassword = process.env.ORBITZONE_DEMO_PASSWORD;

if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error(
    "Demo seeding is restricted to development. Set ALLOW_DEMO_SEED=true and never run this in production.",
  );
}
if (!adminPassword || adminPassword.length < 12 || !demoPassword || demoPassword.length < 12) {
  throw new Error(
    "Set ORBITZONE_ADMIN_PASSWORD and ORBITZONE_DEMO_PASSWORD (12+ characters) in Replit Secrets before seeding.",
  );
}

const createdAt = new Date();
const premiumExpiry = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
const profiles = [
  {
    identifier: "admin@orbitzone.test",
    password: adminPassword,
    fullName: "Orbit Zone Safety",
    gender: "female" as const,
    dateOfBirth: "1988-03-18",
    area: "Lokoja",
    bio: "Orbit Zone safety and community account.",
    photoPaths: [],
    isAdmin: true,
    wantsRelationship: false,
    wantsFriendsWithBenefits: false,
    wantsHookup: false,
  },
  {
    identifier: "demo.free@orbitzone.test",
    password: demoPassword,
    fullName: "Tunde Demo",
    gender: "male" as const,
    dateOfBirth: "1994-08-02",
    area: "Felele",
    bio: "A sample free account for testing the Orbit Zone experience.",
    photoPaths: ["demo:/orbit-zone-demo-man-1.jpg"],
    isAdmin: false,
    wantsRelationship: false,
    wantsFriendsWithBenefits: false,
    wantsHookup: false,
  },
  {
    identifier: "demo.premium@orbitzone.test",
    password: demoPassword,
    fullName: "Emeka Demo",
    gender: "male" as const,
    dateOfBirth: "1992-05-14",
    area: "Adankolo",
    bio: "A sample Premium account for testing paid features.",
    photoPaths: ["demo:/orbit-zone-demo-man-1.jpg"],
    isAdmin: false,
    premiumUntil: premiumExpiry,
    wantsRelationship: false,
    wantsFriendsWithBenefits: false,
    wantsHookup: false,
  },
  {
    identifier: "demo.ada@orbitzone.test",
    password: demoPassword,
    fullName: "Ada Demo",
    gender: "female" as const,
    dateOfBirth: "1996-11-23",
    area: "Lokongoma",
    bio: "Enjoys quiet evenings, local food, and meeting kind people.",
    photoPaths: ["demo:/orbit-zone-demo-woman-1.jpg"],
    isAdmin: false,
    wantsRelationship: true,
    wantsFriendsWithBenefits: false,
    wantsHookup: false,
  },
  {
    identifier: "demo.zainab@orbitzone.test",
    password: demoPassword,
    fullName: "Zainab Demo",
    gender: "female" as const,
    dateOfBirth: "1993-06-09",
    area: "Ganaja",
    bio: "Curious, warm, and always looking for a new Lokoja spot.",
    photoPaths: ["demo:/orbit-zone-demo-woman-2.jpg"],
    isAdmin: false,
    wantsRelationship: false,
    wantsFriendsWithBenefits: true,
    wantsHookup: true,
  },
];

try {
  for (const profile of profiles) {
    const passwordHash = await bcrypt.hash(profile.password, 12);
    const { password: _password, ...values } = profile;
    await db
      .insert(usersTable)
      .values({
        ...values,
        passwordHash,
        acceptsTermsAt: createdAt,
        acceptsPrivacyAt: createdAt,
      })
      .onConflictDoNothing({ target: usersTable.identifier });
  }
  console.info(
    "Demo seed complete (existing accounts were left unchanged). Test emails: admin@orbitzone.test, demo.free@orbitzone.test, demo.premium@orbitzone.test, demo.ada@orbitzone.test, demo.zainab@orbitzone.test.",
  );
} finally {
  await db.$client.end();
}
