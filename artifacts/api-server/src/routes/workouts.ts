import { Router } from "express";
import { db } from "@workspace/db";
import { exerciseLogsTable } from "@workspace/db";
import { getWorkoutById } from "../services/dataService.js";
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

      return {
        ...exercise,
        workoutId: workout.id,
        previousWeekSets: prevLog?.sets ?? null,
        previousWeekReps: prevLog?.reps ?? null,
        previousWeekWeight: prevLog?.weight ? parseFloat(prevLog.weight) : null,
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
