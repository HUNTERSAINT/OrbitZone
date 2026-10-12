import { Router, type IRouter } from "express";
import { GetMyPlanResponse } from "@workspace/api-zod";
import { requireUser } from "../middlewares/require-auth";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function daysRemaining(expiresAt: Date | null): number {
  if (!expiresAt || expiresAt.getTime() <= Date.now()) return 0;
  return Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS);
}

router.get("/plan", requireUser, (req, res): void => {
  const user = req.currentUser!;
  const premiumActive =
    user.gender === "female" ||
    Boolean(user.premiumUntil && user.premiumUntil.getTime() > Date.now());
  const hookupActive =
    user.gender === "female" ||
    Boolean(user.hookupUntil && user.hookupUntil.getTime() > Date.now());

  res.json(
    GetMyPlanResponse.parse({
      isWoman: user.gender === "female",
      premiumActive,
      hookupActive,
      premiumUntil: user.premiumUntil?.toISOString() ?? null,
      hookupUntil: user.hookupUntil?.toISOString() ?? null,
      premiumDaysRemaining:
        user.gender === "female" ? 0 : daysRemaining(user.premiumUntil),
      hookupDaysRemaining:
        user.gender === "female" ? 0 : daysRemaining(user.hookupUntil),
    }),
  );
});

export default router;
