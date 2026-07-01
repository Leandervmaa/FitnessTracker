import { logger } from "../lib/logger.js";

export const SPREADSHEET_ID = "1Wua3g3hmvVCKgXBHjQSZSinVKuBgTmNFAJHL5bpuvj0";

export type ConnectionStatus = "verbonden" | "niet_geautoriseerd" | "fout";

export interface SheetsStatus {
  status: ConnectionStatus;
  bericht: string;
  spreadsheetId: string;
  spreadsheetNaam?: string;
}

export type SheetProperty = {
  sheetId: number;
  title: string;
  index?: number;
};

function resolveSpreadsheetId(spreadsheetId?: string | null): string {
  return spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID || SPREADSHEET_ID;
}

function getAccessToken(): string | null {
  return process.env.GOOGLE_ACCESS_TOKEN || null;
}

export function isConnected(): boolean {
  return !!getAccessToken();
}

export async function getSheetsStatus(spreadsheetId?: string | null): Promise<SheetsStatus> {
  const token = getAccessToken();
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);
  if (!token) {
    return {
      status: "niet_geautoriseerd",
      bericht:
        "Google Sheets is nog niet gekoppeld. Volg de instructies op de verbindingspagina om je spreadsheet te koppelen.",
      spreadsheetId: resolvedSpreadsheetId,
    };
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}?fields=properties.title`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 401 || resp.status === 403) {
      return {
        status: "niet_geautoriseerd",
        bericht:
          "Het toegangstoken is verlopen of ongeldig. Koppel Google Sheets opnieuw via de verbindingspagina.",
        spreadsheetId: resolvedSpreadsheetId,
      };
    }

    if (!resp.ok) {
      return {
        status: "fout",
        bericht: `Google Sheets API fout (${resp.status}). Controleer de instellingen.`,
        spreadsheetId: resolvedSpreadsheetId,
      };
    }

    const data = (await resp.json()) as { properties?: { title?: string } };
    return {
      status: "verbonden",
      bericht: "Succesvol verbonden met Google Sheets.",
      spreadsheetId: resolvedSpreadsheetId,
      spreadsheetNaam: data.properties?.title,
    };
  } catch (err) {
    logger.error({ err }, "Sheets status check failed");
    return {
      status: "fout",
      bericht:
        "Kan Google Sheets niet bereiken. Controleer de internetverbinding.",
      spreadsheetId: resolvedSpreadsheetId,
    };
  }
}

export async function readRange(sheetRange: string, spreadsheetId?: string | null): Promise<string[][] | null> {
  const token = getAccessToken();
  if (!token) return null;
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}/values/${encodeURIComponent(sheetRange)}`;
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

export async function getSpreadsheetSheets(spreadsheetId?: string | null): Promise<SheetProperty[] | null> {
  const token = getAccessToken();
  if (!token) return null;
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}?fields=sheets.properties(sheetId,title,index)`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Sheets metadata read failed");
      return null;
    }

    const data = (await resp.json()) as {
      sheets?: { properties?: SheetProperty }[];
    };
    return data.sheets?.map((sheet) => sheet.properties).filter((sheet): sheet is SheetProperty => !!sheet) ?? [];
  } catch (err) {
    logger.error({ err }, "Sheets metadata read exception");
    return null;
  }
}

export async function batchUpdate(
  requests: Record<string, unknown>[],
  spreadsheetId?: string | null
): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}:batchUpdate`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Sheets batchUpdate failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Sheets batchUpdate exception");
    return false;
  }
}

export async function ensureSheet(
  sheetName: string,
  spreadsheetId?: string | null,
  templateSheetName?: string | null
): Promise<boolean> {
  const sheets = await getSpreadsheetSheets(spreadsheetId);
  if (!sheets) return false;
  if (sheets.some((sheet) => sheet.title === sheetName)) return true;

  const template = templateSheetName
    ? sheets.find((sheet) => sheet.title === templateSheetName)
    : null;

  if (template) {
    const duplicated = await batchUpdate(
      [
        {
          duplicateSheet: {
            sourceSheetId: template.sheetId,
            insertSheetIndex: (template.index ?? sheets.length - 1) + 1,
            newSheetName: sheetName,
          },
        },
      ],
      spreadsheetId,
    );
    if (duplicated) return true;
  }

  return batchUpdate(
    [
      {
        addSheet: {
          properties: {
            title: sheetName,
            gridProperties: { rowCount: 200, columnCount: 26 },
          },
        },
      },
    ],
    spreadsheetId,
  );
}

export async function writeRange(
  sheetRange: string,
  values: string[][],
  spreadsheetId?: string | null
): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}/values/${encodeURIComponent(sheetRange)}?valueInputOption=USER_ENTERED`;
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
  values: string[][],
  spreadsheetId?: string | null
): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}/values/${encodeURIComponent(sheetRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
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
