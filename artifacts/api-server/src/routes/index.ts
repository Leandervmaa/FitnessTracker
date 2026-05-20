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

const router: IRouter = Router();

router.use(healthRouter);
router.use("/weeks", weeksRouter);
router.use("/workouts", workoutsRouter);
router.use("/exercise-logs", exerciseLogsRouter);
router.use("/nutrition", nutritionRouter);
router.use("/feedback-questions", feedbackQuestionsRouter);
router.use("/feedback", feedbackRouter);
router.use("/upload", uploadRouter);
router.use("/data-status", dataStatusRouter);
router.use("/export", exportRouter);
router.use("/progress-photos", progressPhotosRouter);
router.use("/food", foodRouter);

export default router;
