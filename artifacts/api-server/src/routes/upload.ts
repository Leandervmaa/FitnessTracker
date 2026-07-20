import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseExcelFile, EXCEL_PATH, getExcelPath } from "../services/excelParser.js";
import {
  importExcelToDb,
  saveImportSnapshot,
  rollbackImport,
  hasImportSnapshot,
} from "../services/importService.js";
import XLSX from "xlsx";
import { getScopedClientId, requireTrainer } from "../lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.dirname(EXCEL_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dataDir),
  filename: (req, _file, cb) => cb(null, path.basename(getExcelPath(getScopedClientId(req)))),
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls");
    cb(null, ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

/**
 * POST /api/upload/excel
 * Upload Excel sheet, parse it, and sync the training plan to the database.
 * Saves a rollback snapshot first so the trainer can undo.
 */
router.post("/excel", requireTrainer, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return void res.status(400).json({ error: "Geen Excel-bestand ontvangen. Stuur een .xlsx bestand mee." });
  }

  const clientId = getScopedClientId(req);
  const excelPath = getExcelPath(clientId);

  const result = parseExcelFile(excelPath);
  if (!result) {
    return void res.status(422).json({
      error: "Bestand ontvangen maar kon niet worden geparsed. Controleer of het het juiste Excel-bestand is.",
    });
  }

  // Save snapshot BEFORE we change anything in the DB (for undo)
  try {
    await saveImportSnapshot(clientId);
  } catch (err) {
    req.log.warn({ err }, "Failed to save import snapshot");
  }

  // Sync parsed Excel data into the database
  let importStats = {
    weeksImported: 0,
    workoutsCreated: 0,
    exercisesCreated: 0,
    setLogsImported: 0,
    nutritionEntriesImported: 0,
    feedbackAnswersImported: 0,
  };
  try {
    importStats = await importExcelToDb(clientId, result);
  } catch (err) {
    req.log.error({ err }, "Failed to import Excel to DB after upload");
    return void res.status(500).json({
      error: "Bestand ontvangen, maar importeren naar database mislukt. Probeer opnieuw.",
    });
  }

  return void res.json({
    bericht: "Excel-bestand succesvol geüpload en verwerkt.",
    tabbladen: result.sheetNames,
    wekenGeladen: result.weeks.length,
    wekenGeimporteerd: importStats.weeksImported,
    trainingenAangemaakt: importStats.workoutsCreated,
    oefeninenAangemaakt: importStats.exercisesCreated,
    setsGeimporteerd: importStats.setLogsImported,
    dagboekInvoerGeimporteerd: importStats.nutritionEntriesImported,
    feedbackAntwoordenGeimporteerd: importStats.feedbackAnswersImported,
    feedbackVragen: result.feedbackQuestions.length,
    parsedAt: result.parsedAt,
    kanOngedaanMaken: true,
  });
});

/**
 * POST /api/upload/excel/undo
 * Roll back the last Excel import to the previous database state.
 */
router.post("/excel/undo", requireTrainer, async (req, res) => {
  const clientId = getScopedClientId(req);
  if (!hasImportSnapshot(clientId)) {
    return void res.status(404).json({ error: "Geen recente import om ongedaan te maken." });
  }
  try {
    const result = await rollbackImport(clientId);
    return void res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to rollback import");
    return void res.status(500).json({ error: "Ongedaan maken mislukt" });
  }
});

/**
 * GET /api/upload/excel/undo-available
 * Check if an undo snapshot is available for the current client.
 */
router.get("/excel/undo-available", requireTrainer, (req, res) => {
  const clientId = getScopedClientId(req);
  return void res.json({ available: hasImportSnapshot(clientId) });
});

router.delete("/excel", requireTrainer, (req, res) => {
  const excelPath = getExcelPath(getScopedClientId(req));
  if (fs.existsSync(excelPath)) {
    fs.unlinkSync(excelPath);
    res.json({ bericht: "Excel-bestand verwijderd. Er is nu geen trainingsschema gekoppeld." });
  } else {
    res.status(404).json({ error: "Geen Excel-bestand aanwezig." });
  }
});

router.get("/excel/download", (req, res) => {
  const excelPath = getExcelPath(getScopedClientId(req));
  if (fs.existsSync(excelPath)) {
    res.download(excelPath, "Fitness_Progressie.xlsx");
  } else {
    res.status(404).json({ error: "Geen Excel-bestand aanwezig." });
  }
});

router.get("/excel/json", (req, res) => {
  const excelPath = getExcelPath(getScopedClientId(req));
  if (fs.existsSync(excelPath)) {
    try {
      const wb = XLSX.readFile(excelPath);
      const data: Record<string, string[][]> = {};
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: false,
        });
        data[sheetName] = rows;
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to read excel file" });
    }
  } else {
    res.status(404).json({ error: "Geen Excel-bestand aanwezig." });
  }
});

export default router;
