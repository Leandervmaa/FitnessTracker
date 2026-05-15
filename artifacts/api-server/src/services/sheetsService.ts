import { logger } from "../lib/logger.js";

export const SPREADSHEET_ID = "1Wua3g3hmvVCKgXBHjQSZSinVKuBgTmNFAJHL5bpuvj0";

export type ConnectionStatus = "verbonden" | "niet_geautoriseerd" | "fout";

export interface SheetsStatus {
  status: ConnectionStatus;
  bericht: string;
  spreadsheetId: string;
  spreadsheetNaam?: string;
}

function getAccessToken(): string | null {
  return process.env.GOOGLE_ACCESS_TOKEN || null;
}

export function isConnected(): boolean {
  return !!getAccessToken();
}

export async function getSheetsStatus(): Promise<SheetsStatus> {
  const token = getAccessToken();
  if (!token) {
    return {
      status: "niet_geautoriseerd",
      bericht:
        "Google Sheets is nog niet gekoppeld. Volg de instructies op de verbindingspagina om je spreadsheet te koppelen.",
      spreadsheetId: SPREADSHEET_ID,
    };
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=properties.title`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 401 || resp.status === 403) {
      return {
        status: "niet_geautoriseerd",
        bericht:
          "Het toegangstoken is verlopen of ongeldig. Koppel Google Sheets opnieuw via de verbindingspagina.",
        spreadsheetId: SPREADSHEET_ID,
      };
    }

    if (!resp.ok) {
      return {
        status: "fout",
        bericht: `Google Sheets API fout (${resp.status}). Controleer de instellingen.`,
        spreadsheetId: SPREADSHEET_ID,
      };
    }

    const data = (await resp.json()) as { properties?: { title?: string } };
    return {
      status: "verbonden",
      bericht: "Succesvol verbonden met Google Sheets.",
      spreadsheetId: SPREADSHEET_ID,
      spreadsheetNaam: data.properties?.title,
    };
  } catch (err) {
    logger.error({ err }, "Sheets status check failed");
    return {
      status: "fout",
      bericht:
        "Kan Google Sheets niet bereiken. Controleer de internetverbinding.",
      spreadsheetId: SPREADSHEET_ID,
    };
  }
}

export async function readRange(sheetRange: string): Promise<string[][] | null> {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetRange)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, range: sheetRange }, "Sheets read failed");
      return null;
    }

    const data = (await resp.json()) as { values?: string[][] };
    return data.values ?? [];
  } catch (err) {
    logger.error({ err, range: sheetRange }, "Sheets readRange exception");
    return null;
  }
}

export async function writeRange(
  sheetRange: string,
  values: string[][]
): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetRange)}?valueInputOption=USER_ENTERED`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ range: sheetRange, majorDimension: "ROWS", values }),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, range: sheetRange }, "Sheets write failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, range: sheetRange }, "Sheets writeRange exception");
    return false;
  }
}

export async function appendRow(
  sheetRange: string,
  values: string[][]
): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ range: sheetRange, majorDimension: "ROWS", values }),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, range: sheetRange }, "Sheets append failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, range: sheetRange }, "Sheets appendRow exception");
    return false;
  }
}
