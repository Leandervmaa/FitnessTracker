import { Router, type IRouter } from "express";
import healthRouter from "./health";
import weeksRouter from "./weeks";
import workoutsRouter from "./workouts";
import exerciseLogsRouter from "./exerciseLogs";
import nutritionRouter from "./nutrition";
import feedbackRouter, { feedbackQuestionsRouter } from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/weeks", weeksRouter);
router.use("/workouts", workoutsRouter);
router.use("/exercise-logs", exerciseLogsRouter);
router.use("/nutrition", nutritionRouter);
router.use("/feedback-questions", feedbackQuestionsRouter);
router.use("/feedback", feedbackRouter);

export default router;
