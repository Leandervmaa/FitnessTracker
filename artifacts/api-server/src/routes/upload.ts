import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseExcelFile, EXCEL_PATH, getExcelPath } from "../services/excelParser.js";
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

router.post("/excel", requireTrainer, upload.single("file"), (req, res) => {
  if (!req.file) {
    return void res.status(400).json({ error: "Geen Excel-bestand ontvangen. Stuur een .xlsx bestand mee." });
  }

  const excelPath = getExcelPath(getScopedClientId(req));
  const result = parseExcelFile(excelPath);
  if (!result) {
    return void res.status(422).json({
      error: "Bestand ontvangen maar kon niet worden geparsed. Controleer of het het juiste Excel-bestand is.",
    });
  }

  return void res.json({
    bericht: "Excel-bestand succesvol geüpload en verwerkt.",
    tabbladen: result.sheetNames,
    wekenGeladen: result.weeks.length,
    feedbackVragen: result.feedbackQuestions.length,
    parsedAt: result.parsedAt,
  });
});

router.delete("/excel", requireTrainer, (req, res) => {
  const excelPath = getExcelPath(getScopedClientId(req));
  if (fs.existsSync(excelPath)) {
    fs.unlinkSync(excelPath);
    res.json({ bericht: "Excel-bestand verwijderd. App gebruikt nu demodata." });
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
