import { Router } from "express";
import { db } from "@workspace/db";
import {
  exerciseLogsTable,
  exerciseSetLogsTable,
  feedbackAnswersTable,
  nutritionEntriesTable,
  plannedWorkoutExercisesTable,
  plannedWorkoutsTable,
  progressPhotosTable,
} from "@workspace/db";
import { getAllWeekNumbers, getWeek } from "../services/dataService.js";
import { asc, eq, and } from "drizzle-orm";
import { getScopedClientId } from "../lib/auth.js";

const router = Router();

const DAYS_OF_WEEK     = 7;
const QUESTIONS_COUNT  = 4;
const PHOTO_ANGLES     = ["front", "side", "back"] as const;
const PHOTO_WEEKS      = new Set([1, 4, 7, 10, 13, 16, 20, 23, 26]);

async function buildWeekSummary(weekNumber: number, clientId: string) {
  const weekProgram = getWeek(weekNumber, clientId);

  const [logs, plannedWorkouts, plannedExercises, plannedSetLogs, nutritionEntries, feedbackAnswers, photos] = await Promise.all([
    db.select().from(exerciseLogsTable).where(and(eq(exerciseLogsTable.clientId, clientId), eq(exerciseLogsTable.weekNumber, weekNumber))),
    db.select().from(plannedWorkoutsTable).where(and(eq(plannedWorkoutsTable.clientId, clientId), eq(plannedWorkoutsTable.weekNumber, weekNumber))),
    db.select().from(plannedWorkoutExercisesTable).where(and(eq(plannedWorkoutExercisesTable.clientId, clientId), eq(plannedWorkoutExercisesTable.weekNumber, weekNumber))),
    db.select().from(exerciseSetLogsTable).where(and(eq(exerciseSetLogsTable.clientId, clientId), eq(exerciseSetLogsTable.weekNumber, weekNumber))),
    db.select().from(nutritionEntriesTable).where(and(eq(nutritionEntriesTable.clientId, clientId), eq(nutritionEntriesTable.weekNumber, weekNumber))),
    db.select().from(feedbackAnswersTable).where(and(eq(feedbackAnswersTable.clientId, clientId), eq(feedbackAnswersTable.weekNumber, weekNumber))),
    PHOTO_WEEKS.has(weekNumber)
      ? db.select().from(progressPhotosTable).where(and(eq(progressPhotosTable.clientId, clientId), eq(progressPhotosTable.weekNumber, weekNumber)))
      : Promise.resolve([]),
  ]);

  let workoutsTotal = 0;
  let completedWorkouts = 0;

  if (plannedWorkouts.length > 0) {
    workoutsTotal = plannedWorkouts.length;
    const completedPlannedExerciseIds = new Set(plannedSetLogs.map((log) => log.plannedExerciseId));
    completedWorkouts = plannedWorkouts.filter((workout) => {
      const exercises = plannedExercises.filter((exercise) => exercise.workoutId === workout.id);
      return exercises.length > 0 && exercises.every((exercise) => completedPlannedExerciseIds.has(exercise.id));
    }).length;
  } else if (weekProgram) {
    workoutsTotal = weekProgram.workouts.length;
    const completedExerciseIds = new Set(logs.map((l) => l.exerciseId));
    completedWorkouts = weekProgram.workouts.filter((workout) =>
      workout.exercises.length > 0 && workout.exercises.every((e) => completedExerciseIds.has(e.id))
    ).length;
  }

  const nutritionDays       = new Set(nutritionEntries.map((n) => n.day)).size;
  const photosRequired      = PHOTO_WEEKS.has(weekNumber);
  const uploadedAngles      = new Set(photos.map((p) => p.angle));
  const photosComplete      = !photosRequired || PHOTO_ANGLES.every(a => uploadedAngles.has(a));
  const trainingComplete    = workoutsTotal > 0 && completedWorkouts >= workoutsTotal;
  const dagboekComplete     = nutritionDays >= DAYS_OF_WEEK;
  const feedbackComplete    = feedbackAnswers.length >= QUESTIONS_COUNT;

  const isComplete = trainingComplete && dagboekComplete && feedbackComplete && photosComplete;

  return {
    weekNumber,
    label: `Week ${weekNumber}`,
    isComplete,
    workoutsCompleted:      completedWorkouts,
    workoutsTotal,
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
    const clientId = getScopedClientId(req);
    const plannedWeeks = await db
      .select({ weekNumber: plannedWorkoutsTable.weekNumber })
      .from(plannedWorkoutsTable)
      .where(eq(plannedWorkoutsTable.clientId, clientId))
      .orderBy(asc(plannedWorkoutsTable.weekNumber));
    const allWeekNumbers = Array.from(
      new Set([...getAllWeekNumbers(clientId), ...plannedWeeks.map((week) => week.weekNumber)]),
    ).sort((a, b) => a - b);
    if (allWeekNumbers.length === 0) {
      return void res.json([await buildWeekSummary(1, clientId)]);
    }
    const weeks = await Promise.all(allWeekNumbers.map((weekNumber) => buildWeekSummary(weekNumber, clientId)));
    return void res.json(weeks);
  } catch (err) {
    req.log.error({ err }, "Failed to list weeks");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/current", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const plannedWeeks = await db
      .select({ weekNumber: plannedWorkoutsTable.weekNumber })
      .from(plannedWorkoutsTable)
      .where(eq(plannedWorkoutsTable.clientId, clientId))
      .orderBy(asc(plannedWorkoutsTable.weekNumber));
    const allWeekNumbers = Array.from(
      new Set([...getAllWeekNumbers(clientId), ...plannedWeeks.map((week) => week.weekNumber)]),
    ).sort((a, b) => a - b);
    let currentWeek = allWeekNumbers[0] ?? 1;

    for (const weekNumber of allWeekNumbers) {
      const summary = await buildWeekSummary(weekNumber, clientId);
      currentWeek = weekNumber;
      if (!summary.isComplete) break;
    }

    const summary = await buildWeekSummary(currentWeek, clientId);
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

    const clientId = getScopedClientId(req);
    const weekProgram = getWeek(weekNumber, clientId);
    if (!weekProgram) return void res.json([]);

    const logs = await db
      .select()
      .from(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.clientId, clientId), eq(exerciseLogsTable.weekNumber, weekNumber)));

    const completedExerciseIds = new Set(logs.map((l) => l.exerciseId));

    const workoutSummaries = weekProgram.workouts.map((workout) => ({
      id: workout.id,
      weekNumber,
      name: workout.name,
      dayLabel: workout.dayLabel,
      exerciseCount: workout.exercises.length,
      completedCount: workout.exercises.filter((e) => completedExerciseIds.has(e.id)).length,
      exercises: workout.exercises.map(e => ({ id: e.id, name: e.name })),
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
      .where(and(eq(exerciseLogsTable.clientId, getScopedClientId(req)), eq(exerciseLogsTable.weekNumber, weekNumber)));

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
