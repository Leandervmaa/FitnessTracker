import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import fs from "fs";
import path from "path";
import { getExcelPath } from "./excelParser.js";
import { logger } from "../lib/logger.js";

export function extractGoogleSheetId(input: string | null | undefined): string | null {
  const value = String(input || "").trim();
  if (!value) return null;

  const docsMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (docsMatch?.[1]) return docsMatch[1];

  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) return value;
  return null;
}

export async function getClientLiveSheet(clientId: string): Promise<{
  type: string | null;
  url: string | null;
  spreadsheetId: string | null;
}> {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) return { type: null, url: null, spreadsheetId: null };

  const spreadsheetId = client.liveSheetId || extractGoogleSheetId(client.liveSheetUrl);
  return {
    type: client.liveSheetType,
    url: client.liveSheetUrl,
    spreadsheetId,
  };
}

const liveRefreshCache = new Map<string, number>();
const LIVE_REFRESH_INTERVAL_MS = 60_000;

export async function refreshClientLiveSheet(clientId: string): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const lastRefresh = liveRefreshCache.get(clientId) ?? 0;
  if (Date.now() - lastRefresh < LIVE_REFRESH_INTERVAL_MS) return;

  const token = process.env.GOOGLE_ACCESS_TOKEN || null;
  const url = `https://docs.google.com/spreadsheets/d/${liveSheet.spreadsheetId}/export?format=xlsx`;

  try {
    const resp = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!resp.ok) {
      logger.warn({ clientId, status: resp.status }, "Failed to refresh live Google Sheet export");
      liveRefreshCache.set(clientId, Date.now());
      return;
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    const excelPath = getExcelPath(clientId);
    fs.mkdirSync(path.dirname(excelPath), { recursive: true });
    fs.writeFileSync(excelPath, buffer);
    liveRefreshCache.set(clientId, Date.now());
  } catch (err) {
    logger.warn({ err, clientId }, "Live Google Sheet refresh failed");
    liveRefreshCache.set(clientId, Date.now());
  }
}
