import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export const requireUser: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: "This account is unavailable." });
    return;
  }

  req.currentUser = user;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.currentUser?.isAdmin) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
};

export const requirePremiumForMen: RequestHandler = (req, res, next) => {
  const user = req.currentUser!;
  if (
    user.gender === "male" &&
    (!user.premiumUntil || user.premiumUntil.getTime() <= Date.now())
  ) {
    res.status(403).json({ error: "upgrade required" });
    return;
  }
  next();
};

export const requireHookupForMen: RequestHandler = (req, res, next) => {
  const user = req.currentUser!;
  if (
    user.gender === "male" &&
    (!user.hookupUntil || user.hookupUntil.getTime() <= Date.now())
  ) {
    res.status(403).json({ error: "upgrade required" });
    return;
  }
  next();
};
