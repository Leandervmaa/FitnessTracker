import { Router } from "express";
import { db } from "@workspace/db";
import { exerciseLogsTable, nutritionEntriesTable, feedbackAnswersTable, progressPhotosTable } from "@workspace/db";
import { getAllWeekNumbers, getWeek } from "../services/dataService.js";
import { eq, and } from "drizzle-orm";

const router = Router();

const TOTAL_WORKOUTS   = 4;
const DAYS_OF_WEEK     = 7;
const QUESTIONS_COUNT  = 4;
const PHOTO_ANGLES     = ["front", "side", "back"] as const;
const PHOTO_WEEKS      = new Set([1, 4, 7, 10, 13, 16, 20, 23, 26]);

async function buildWeekSummary(weekNumber: number) {
  const weekProgram = getWeek(weekNumber);

  // Weeks 1–14 are already finished — mark everything as complete
  if (weekNumber <= 14) {
    return {
      weekNumber,
      label: `Week ${weekNumber}`,
      isComplete:            true,
      workoutsCompleted:     TOTAL_WORKOUTS,
      nutritionDaysCompleted: DAYS_OF_WEEK,
      feedbackCompleted:     true,
      photosRequired:        PHOTO_WEEKS.has(weekNumber),
      photosComplete:        true,
      // Per-section flags
      trainingComplete:      true,
      dagboekComplete:       true,
    };
  }

  // Week 15+ — check actual DB data
  const [logs, nutritionEntries, feedbackAnswers, photos] = await Promise.all([
    db.select().from(exerciseLogsTable).where(eq(exerciseLogsTable.weekNumber, weekNumber)),
    db.select().from(nutritionEntriesTable).where(eq(nutritionEntriesTable.weekNumber, weekNumber)),
    db.select().from(feedbackAnswersTable).where(eq(feedbackAnswersTable.weekNumber, weekNumber)),
    PHOTO_WEEKS.has(weekNumber)
      ? db.select().from(progressPhotosTable).where(eq(progressPhotosTable.weekNumber, weekNumber))
      : Promise.resolve([]),
  ]);

  const completedExerciseIds = new Set(logs.map((l) => l.exerciseId));
  const completedWorkouts = weekProgram?.workouts.filter((workout) =>
    workout.exercises.every((e) => completedExerciseIds.has(e.id))
  ).length ?? 0;

  const nutritionDays       = new Set(nutritionEntries.map((n) => n.day)).size;
  const photosRequired      = PHOTO_WEEKS.has(weekNumber);
  const uploadedAngles      = new Set(photos.map((p) => p.angle));
  const photosComplete      = !photosRequired || PHOTO_ANGLES.every(a => uploadedAngles.has(a));
  const trainingComplete    = completedWorkouts >= TOTAL_WORKOUTS;
  const dagboekComplete     = nutritionDays >= DAYS_OF_WEEK;
  const feedbackComplete    = feedbackAnswers.length >= QUESTIONS_COUNT;

  const isComplete = trainingComplete && dagboekComplete && feedbackComplete && photosComplete;

  return {
    weekNumber,
    label: `Week ${weekNumber}`,
    isComplete,
    workoutsCompleted:      completedWorkouts,
    nutritionDaysCompleted: nutritionDays,
    feedbackCompleted:      feedbackComplete,
    photosRequired,
    photosComplete,
    trainingComplete,
    dagboekComplete,
  };
}

router.get("/", async (req, res) => {
  try {
    const allWeekNumbers = getAllWeekNumbers();
    const weeks = await Promise.all(allWeekNumbers.map(buildWeekSummary));
    return void res.json(weeks);
  } catch (err) {
    req.log.error({ err }, "Failed to list weeks");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/current", async (req, res) => {
  try {
    const allWeekNumbers = getAllWeekNumbers();
    let currentWeek = allWeekNumbers[0];

    for (const weekNumber of allWeekNumbers) {
      const summary = await buildWeekSummary(weekNumber);
      currentWeek = weekNumber;
      if (!summary.isComplete) break;
    }

    const summary = await buildWeekSummary(currentWeek);
    return void res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to get current week");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/:weekNumber/workouts", async (req, res) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    if (isNaN(weekNumber)) return void res.status(400).json({ error: "Ongeldig weeknummer" });

    const weekProgram = getWeek(weekNumber);
    if (!weekProgram) return void res.status(404).json({ error: "Week niet gevonden" });

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

    return void res.json(workoutSummaries);
  } catch (err) {
    req.log.error({ err }, "Failed to get workouts for week");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/:weekNumber/workout-status", async (req, res) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    if (isNaN(weekNumber)) return void res.status(400).json({ error: "Ongeldig weeknummer" });

    const logs = await db
      .select()
      .from(exerciseLogsTable)
      .where(eq(exerciseLogsTable.weekNumber, weekNumber));

    return void res.json({
      weekNumber,
      completedExerciseIds: logs.map((l) => l.exerciseId),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get week workout status");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
