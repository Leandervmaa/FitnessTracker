import { Router, type IRouter } from "express";
import healthRouter from "./health";
import weeksRouter from "./weeks";
import workoutsRouter from "./workouts";
import exerciseLogsRouter from "./exerciseLogs";
import nutritionRouter from "./nutrition";
import feedbackRouter, { feedbackQuestionsRouter } from "./feedback";
import uploadRouter from "./upload";
import dataStatusRouter from "./dataStatus";
import exportRouter from "./export";
import progressPhotosRouter from "./progressPhotos";
import foodRouter from "./food";
import syncRouter from "./sync";
import authRouter from "./auth";
import clientsRouter from "./clients";
import libraryRouter from "./library";
import plansRouter from "./plans";
import { getScopedClientId, requireAuth } from "../lib/auth";
import { refreshClientLiveSheet } from "../services/clientSheetService";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(requireAuth);
router.use("/clients", clientsRouter);
router.use("/library", libraryRouter);
router.use(async (req, _res, next) => {
  try {
    await refreshClientLiveSheet(getScopedClientId(req));
  } catch {
    // Live sheet refresh should never block normal app usage.
  }
  next();
});
router.use("/weeks", weeksRouter);
router.use("/workouts", workoutsRouter);
router.use("/plans", plansRouter);
router.use("/exercise-logs", exerciseLogsRouter);
router.use("/nutrition", nutritionRouter);
router.use("/feedback-questions", feedbackQuestionsRouter);
router.use("/feedback", feedbackRouter);
router.use("/upload", uploadRouter);
router.use("/data-status", dataStatusRouter);
router.use("/export", exportRouter);
router.use("/progress-photos", progressPhotosRouter);
router.use("/food", foodRouter);
router.use("/sync", syncRouter);

export default router;
