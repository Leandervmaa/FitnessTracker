import { Router } from "express";
import { getDataStatus } from "../services/dataService.js";
import { EXCEL_PATH } from "../services/excelParser.js";

const router = Router();

router.get("/", (req, res) => {
  const status = getDataStatus();
  res.json({
    ...status,
    excelBestandsPad: EXCEL_PATH,
    uploadInstructies: status.source === "demo"
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
