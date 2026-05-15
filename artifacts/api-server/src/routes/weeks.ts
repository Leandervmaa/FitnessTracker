import { Router } from "express";
import { db } from "@workspace/db";
import { exerciseLogsTable, nutritionEntriesTable, feedbackAnswersTable } from "@workspace/db";
import { getAllWeeks, getWeekProgram } from "../data/workoutProgram.js";
import { eq } from "drizzle-orm";

const router = Router();

const TOTAL_WORKOUTS = 4;
const DAYS_OF_WEEK = 7;
const QUESTIONS_COUNT = 4;

async function buildWeekSummary(weekNumber: number) {
  const weekProgram = getWeekProgram(weekNumber);
  const [logs, nutritionEntries, feedbackAnswers] = await Promise.all([
    db.select().from(exerciseLogsTable).where(eq(exerciseLogsTable.weekNumber, weekNumber)),
    db.select().from(nutritionEntriesTable).where(eq(nutritionEntriesTable.weekNumber, weekNumber)),
    db.select().from(feedbackAnswersTable).where(eq(feedbackAnswersTable.weekNumber, weekNumber)),
  ]);

  const completedExerciseIds = new Set(logs.map((l) => l.exerciseId));

  const completedWorkouts = weekProgram?.workouts.filter((workout) =>
    workout.exercises.every((e) => completedExerciseIds.has(e.id))
  ).length ?? 0;

  const nutritionDays = new Set(nutritionEntries.map((n) => n.day)).size;

  const isComplete =
    completedWorkouts >= TOTAL_WORKOUTS &&
    nutritionDays >= DAYS_OF_WEEK &&
    feedbackAnswers.length >= QUESTIONS_COUNT;

  return {
    weekNumber,
    label: `Week ${weekNumber}`,
    isComplete,
    workoutsCompleted: completedWorkouts,
    nutritionDaysCompleted: nutritionDays,
    feedbackCompleted: feedbackAnswers.length >= QUESTIONS_COUNT,
  };
}

router.get("/", async (req, res) => {
  try {
    const allWeekNumbers = getAllWeeks();
    const weeks = await Promise.all(allWeekNumbers.map(buildWeekSummary));
    res.json(weeks);
  } catch (err) {
    req.log.error({ err }, "Failed to list weeks");
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/current", async (req, res) => {
  try {
    const allWeekNumbers = getAllWeeks();
    let currentWeek = allWeekNumbers[0];

    for (const weekNumber of allWeekNumbers) {
      const summary = await buildWeekSummary(weekNumber);
      currentWeek = weekNumber;
      if (!summary.isComplete) break;
    }

    const summary = await buildWeekSummary(currentWeek);
    res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to get current week");
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/:weekNumber/workouts", async (req, res) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    if (isNaN(weekNumber)) return res.status(400).json({ error: "Ongeldig weeknummer" });

    const weekProgram = getWeekProgram(weekNumber);
    if (!weekProgram) return res.status(404).json({ error: "Week niet gevonden" });

    const logs = await db
      .select()
      .from(exerciseLogsTable)
      .where(eq(exerciseLogsTable.weekNumber, weekNumber));

    const completedExerciseIds = new Set(logs.map((l) => l.exerciseId));

    const workoutSummaries = weekProgram.workouts.map((workout) => ({
      id: workout.id,
      weekNumber,
      name: workout.name,
      dayLabel: workout.dayLabel,
      exerciseCount: workout.exercises.length,
      completedCount: workout.exercises.filter((e) => completedExerciseIds.has(e.id)).length,
    }));

    res.json(workoutSummaries);
  } catch (err) {
    req.log.error({ err }, "Failed to get workouts for week");
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/:weekNumber/workout-status", async (req, res) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    if (isNaN(weekNumber)) return res.status(400).json({ error: "Ongeldig weeknummer" });

    const logs = await db
      .select()
      .from(exerciseLogsTable)
      .where(eq(exerciseLogsTable.weekNumber, weekNumber));

    res.json({
      weekNumber,
      completedExerciseIds: logs.map((l) => l.exerciseId),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get week workout status");
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
