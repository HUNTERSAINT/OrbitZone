import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profilesRouter from "./profiles";
import storageRouter from "./storage";
import discoveryRouter from "./discovery";
import adminRouter from "./admin";
import matchesRouter from "./matches";
import searchRouter from "./search";
import planRouter from "./plan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profilesRouter);
router.use(storageRouter);
router.use(discoveryRouter);
router.use(matchesRouter);
router.use(searchRouter);
router.use(planRouter);
router.use(adminRouter);

export default router;
