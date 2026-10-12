import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
} from "@workspace/db";
import {
  ReviewUserVerificationBody,
  ReviewUserVerificationParams,
  ReviewUserVerificationResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireUser } from "../middlewares/require-auth";
import { toSessionUser } from "./auth";

const router: IRouter = Router();

router.patch(
  "/admin/users/:userId/verification",
  requireUser,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ReviewUserVerificationParams.safeParse(req.params);
    const body = ReviewUserVerificationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid verification review." });
      return;
    }

    const [existing] = await db
      .select({
        id: usersTable.id,
        verificationSelfiePath: usersTable.verificationSelfiePath,
      })
      .from(usersTable)
      .where(eq(usersTable.id, params.data.userId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Profile not found." });
      return;
    }
    if (body.data.isVerified && !existing.verificationSelfiePath) {
      res.status(400).json({ error: "A verification selfie must be submitted before approval." });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set({ isVerified: body.data.isVerified })
      .where(eq(usersTable.id, existing.id))
      .returning();
    if (!user) {
      res.status(404).json({ error: "Profile not found." });
      return;
    }
    res.json(ReviewUserVerificationResponse.parse(toSessionUser(user)));
  },
);

export default router;
