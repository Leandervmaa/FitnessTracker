import { Router } from "express";
import { getSheetsStatus, isConnected } from "../services/sheetsService.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const status = await getSheetsStatus();
    res.json({
      ...status,
      instructies: isConnected()
        ? null
        : {
            stap1: "Ga naar de Replit-omgeving en open 'Secrets' (sleutel-icoon).",
            stap2: "Voeg het secret GOOGLE_ACCESS_TOKEN toe met een geldig Google OAuth2 access token dat toegang heeft tot de spreadsheet.",
            stap3: "Hoe een token te verkrijgen: ga naar https://developers.google.com/oauthplayground, selecteer 'Google Sheets API v4' scope, autoriseer en kopieer het access token.",
            stap4: "Herstart de API-server na het toevoegen van het secret.",
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/1Wua3g3hmvVCKgXBHjQSZSinVKuBgTmNFAJHL5bpuvj0`,
            opmerking: "Zorg dat het Google-account waarmee je autoriseert toegang heeft tot de spreadsheet.",
          },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get sheets status");
    res.status(500).json({ error: "Kan verbindingsstatus niet ophalen" });
  }
});

export default router;
