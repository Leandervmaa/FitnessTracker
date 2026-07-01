import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";

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
