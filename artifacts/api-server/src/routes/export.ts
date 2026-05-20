import { Router } from "express";
import { generateExportExcel } from "../services/excelWriter.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * GET /api/export/excel
 * Generates an Excel export with all logged data merged back into the source file.
 * Triggers a file download in the browser.
 */
router.get("/excel", async (req, res) => {
  try {
    logger.info("Generating Excel export...");
    const buffer = await generateExportExcel();

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
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

export default router;
