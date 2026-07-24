import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, plannedWorkoutsTable } from "@workspace/db";
import { getDataStatus } from "../services/dataService.js";
import { getScopedClientId } from "../lib/auth.js";

const router = Router();

router.get("/", async (req, res) => {
  const clientId = getScopedClientId(req);
  const status = getDataStatus(clientId);
  const plannedWorkouts = await db
    .select({ weekNumber: plannedWorkoutsTable.weekNumber })
    .from(plannedWorkoutsTable)
    .where(eq(plannedWorkoutsTable.clientId, clientId));
  const plannedWeekNumbers = Array.from(new Set(plannedWorkouts.map((workout) => workout.weekNumber))).sort((a, b) => a - b);

  res.json({
    ...status,
    excelBestandsPad: status.excelFilePath,
    plannedWeekNumbers,
    plannedWeekCount: plannedWeekNumbers.length,
    firstPlannedWeek: plannedWeekNumbers[0] ?? null,
    lastPlannedWeek: plannedWeekNumbers.length > 0 ? plannedWeekNumbers[plannedWeekNumbers.length - 1] : null,
    uploadInstructies: status.source === "none"
      ? {
          stap1: "Ga naar de app en open 'Instellingen' via het tandwiel-icoon rechts bovenin.",
          stap2: "Klik op 'Excel-bestand uploaden' en selecteer het .xlsx bestand.",
          stap3: "De app herlaadt automatisch de data uit het bestand.",
          opmerking: "Het bestand moet een geldig Bodyrebuild Programma Excel-bestand zijn met tabbladen 'Week 1' t/m 'Week 12', 'Video links', 'Voeding' en 'Feedback'.",
        }
      : null,
  });
});

export default router;
