import { Router } from "express";
import { db } from "@workspace/db";
import { exerciseLogsTable } from "@workspace/db";
import { getWorkoutById, getWeek } from "../services/dataService.js";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/:workoutId", async (req, res) => {
  try {
    const { workoutId } = req.params;
    const workout = getWorkoutById(workoutId);

    if (!workout) return void res.status(404).json({ error: "Training niet gevonden" });

    const prevWeekNumber = workout.weekNumber - 1;
    const prevLogMap = new Map<string, typeof exerciseLogsTable.$inferSelect>();

    if (prevWeekNumber >= 1) {
      const previousLogs = await db
        .select()
        .from(exerciseLogsTable)
        .where(eq(exerciseLogsTable.weekNumber, prevWeekNumber));

      for (const log of previousLogs) {
        prevLogMap.set(log.exerciseId, log);
      }
    }

    const exercisesWithPrev = workout.exercises.map((exercise) => {
      const baseSuffix = exercise.id.replace(/^w\d+-/, "-");
      const prevExerciseId = `w${prevWeekNumber}${baseSuffix}`;
      const prevLog = prevLogMap.get(prevExerciseId);

      let fallbackWeight = exercise.sheetWeights || null;
      let fallbackReps = exercise.sheetReps || null;

      // If no database log exists for previous week, fetch the sheet values from previous week
      if (!prevLog && prevWeekNumber >= 1) {
        const prevWeek = getWeek(prevWeekNumber);
        if (prevWeek) {
          const prevWorkoutId = `w${prevWeekNumber}-${workout.id.split("-").pop()}`;
          const prevWorkoutDef = prevWeek.workouts.find(w => w.id === prevWorkoutId);
          if (prevWorkoutDef) {
            const prevExercise = prevWorkoutDef.exercises.find(e => e.name.toLowerCase() === exercise.name.toLowerCase());
            if (prevExercise) {
              fallbackWeight = prevExercise.sheetWeights || null;
              fallbackReps = prevExercise.sheetReps || null;
            }
          }
        }
      }

      return {
        ...exercise,
        workoutId: workout.id,
        previousWeekSets: prevLog?.sets ?? null,
        previousWeekReps: prevLog?.reps ?? fallbackReps,
        previousWeekWeight: prevLog?.weight ?? fallbackWeight,
      };
    });

    return void res.json({
      id: workout.id,
      weekNumber: workout.weekNumber,
      name: workout.name,
      dayLabel: workout.dayLabel,
      exercises: exercisesWithPrev,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get workout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
