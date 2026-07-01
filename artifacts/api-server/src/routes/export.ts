import { Router } from "express";
import { generateExportExcel, generateWeekplanExcel } from "../services/excelWriter.js";
import { logger } from "../lib/logger.js";
import { getScopedClientId, requireTrainer } from "../lib/auth.js";

const router = Router();

/**
 * GET /api/export/excel
 * Generates an Excel export merging all logged data back into the source file.
 * Triggers a file download in the browser.
 */
router.get("/excel", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    logger.info({ clientId }, "Generating Excel export...");
    const buffer = await generateExportExcel(clientId);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `FitnessTracker_Export_${dateStr}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return void res.send(buffer);
  } catch (err) {
    logger.error({ err }, "Failed to generate Excel export");
    return void res.status(500).json({ error: "Export mislukt. Probeer het opnieuw." });
  }
});

/**
 * GET /api/export/weekplan
 * Exports all planned workouts, exercises and set logs from the database to Excel.
 * Each client's data is completely separate (scoped by clientId).
 * Can be called with ?clientId=... by a trainer to export a specific client.
 * Triggers a file download in the browser.
 */
router.get("/weekplan", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    logger.info({ clientId }, "Generating weekplan Excel export...");
    const buffer = await generateWeekplanExcel(clientId);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `Weekplanning_Export_${dateStr}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return void res.send(buffer);
  } catch (err) {
    logger.error({ err }, "Failed to generate weekplan Excel export");
    return void res.status(500).json({ error: "Weekplan export mislukt. Probeer het opnieuw." });
  }
});

export default router;
