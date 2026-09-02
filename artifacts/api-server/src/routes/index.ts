import { Router, type IRouter } from "express";
import healthRouter from "./health";
import voiceAgentRouter from "./voice-agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(voiceAgentRouter);

export default router;
