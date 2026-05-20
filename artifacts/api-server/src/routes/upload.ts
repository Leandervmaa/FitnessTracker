import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseExcelFile, EXCEL_PATH } from "../services/excelParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.dirname(EXCEL_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dataDir),
  filename: (_req, _file, cb) => cb(null, "programma.xlsx"),
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

router.post("/excel", upload.single("file"), (req, res) => {
  if (!req.file) {
    return void res.status(400).json({ error: "Geen Excel-bestand ontvangen. Stuur een .xlsx bestand mee." });
  }

  const result = parseExcelFile(EXCEL_PATH);
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

router.delete("/excel", (_req, res) => {
  if (fs.existsSync(EXCEL_PATH)) {
    fs.unlinkSync(EXCEL_PATH);
    res.json({ bericht: "Excel-bestand verwijderd. App gebruikt nu demodata." });
  } else {
    res.status(404).json({ error: "Geen Excel-bestand aanwezig." });
  }
});

router.get("/excel/download", (_req, res) => {
  if (fs.existsSync(EXCEL_PATH)) {
    res.download(EXCEL_PATH, "Fitness_Progressie.xlsx");
  } else {
    res.status(404).json({ error: "Geen Excel-bestand aanwezig." });
  }
});

export default router;
