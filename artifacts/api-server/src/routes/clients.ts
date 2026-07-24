import { Router, type Request } from "express";
import fs from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  authSessionsTable,
  clientsTable,
  exerciseLogsTable,
  exerciseSetLogsTable,
  feedbackAnswersTable,
  foodLogsTable,
  nutritionEntriesTable,
  nutritionTargetsTable,
  plannedWorkoutExercisesTable,
  plannedWorkoutsTable,
  progressPhotosTable,
  usersTable,
} from "@workspace/db";
import { createClientWithUser, hashPassword, publicUser } from "../services/identityService.js";
import { requireTrainer } from "../lib/auth.js";
import { extractGoogleSheetId } from "../services/clientSheetService.js";
import { getExcelPath } from "../services/excelParser.js";
import { syncClientDataSheets } from "../services/planningSheetService.js";

const router = Router();

router.use(requireTrainer);

function syncInitialClientSheets(req: Request, clientId: string) {
  void syncClientDataSheets(clientId).catch((err) => {
    req.log.warn({ err, clientId }, "Failed to sync initial client sheets");
  });
}

async function findClientWithSheet(sheetId: string, exceptClientId?: string) {
  const clients = await db.select().from(clientsTable);
  return (
    clients.find((client) => {
      if (exceptClientId && client.id === exceptClientId) return false;
      const clientSheetId = client.liveSheetId || extractGoogleSheetId(client.liveSheetUrl);
      return clientSheetId === sheetId;
    }) ?? null
  );
}

router.get("/", async (req, res) => {
  try {
    const clients = await db.select().from(clientsTable);
    const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
    const userByClient = new Map(users.map((u) => [u.clientId, publicUser(u)]));
    const frontPhotos = await db
      .select({
        id: progressPhotosTable.id,
        clientId: progressPhotosTable.clientId,
        uploadedAt: progressPhotosTable.uploadedAt,
      })
      .from(progressPhotosTable)
      .where(eq(progressPhotosTable.angle, "front"));
    const latestFrontPhotoByClient = new Map<string, { id: number; uploadedAt: Date }>();

    for (const photo of frontPhotos) {
      if (!photo.clientId) continue;
      const current = latestFrontPhotoByClient.get(photo.clientId);
      if (!current || photo.uploadedAt > current.uploadedAt) {
        latestFrontPhotoByClient.set(photo.clientId, {
          id: photo.id,
          uploadedAt: photo.uploadedAt,
        });
      }
    }

    return void res.json(
      clients.map((client) => ({
        ...client,
        user: userByClient.get(client.id) ?? null,
        avatarPhotoId: latestFrontPhotoByClient.get(client.id)?.id ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list clients");
    return void res.status(500).json({ error: "Klanten ophalen mislukt" });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!name || !username || !password) {
      return void res.status(400).json({ error: "Naam, gebruikersnaam en wachtwoord zijn verplicht" });
    }

    const liveSheetUrl = req.body?.liveSheetUrl ? String(req.body.liveSheetUrl).trim() : null;
    const liveSheetId = extractGoogleSheetId(liveSheetUrl);
    if (liveSheetId) {
      const existingClient = await findClientWithSheet(liveSheetId);
      if (existingClient) {
        return void res.status(409).json({ error: `Deze sheet is al gekoppeld aan ${existingClient.name}` });
      }
    }

    const result = await createClientWithUser({
      name,
      username,
      password,
      email: req.body?.email ? String(req.body.email).trim() : null,
      phone: req.body?.phone ? String(req.body.phone).trim() : null,
      goal: req.body?.goal ? String(req.body.goal).trim() : null,
      notes: req.body?.notes ? String(req.body.notes).trim() : null,
      liveSheetType: req.body?.liveSheetType ? String(req.body.liveSheetType).trim() : null,
      liveSheetUrl,
      liveSheetId,
    });

    syncInitialClientSheets(req, result.client.id);

    return void res.status(201).json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to create client");
    if (String(err?.message || "").includes("duplicate key")) {
      return void res.status(409).json({ error: "Deze gebruikersnaam bestaat al" });
    }
    return void res.status(500).json({ error: "Klant aanmaken mislukt" });
  }
});

router.put("/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const liveSheetUrl = req.body?.liveSheetUrl !== undefined ? String(req.body.liveSheetUrl || "").trim() || null : undefined;
    const liveSheetId = liveSheetUrl !== undefined ? extractGoogleSheetId(liveSheetUrl) : undefined;
    if (liveSheetId) {
      const existingClient = await findClientWithSheet(liveSheetId, clientId);
      if (existingClient) {
        return void res.status(409).json({ error: `Deze sheet is al gekoppeld aan ${existingClient.name}` });
      }
    }

    const [updated] = await db
      .update(clientsTable)
      .set({
        name: req.body?.name ? String(req.body.name).trim() : undefined,
        email: req.body?.email !== undefined ? String(req.body.email || "").trim() || null : undefined,
        phone: req.body?.phone !== undefined ? String(req.body.phone || "").trim() || null : undefined,
        goal: req.body?.goal !== undefined ? String(req.body.goal || "").trim() || null : undefined,
        notes: req.body?.notes !== undefined ? String(req.body.notes || "").trim() || null : undefined,
        liveSheetType: req.body?.liveSheetType !== undefined ? String(req.body.liveSheetType || "").trim() || null : undefined,
        liveSheetUrl,
        liveSheetId,
        status: req.body?.status ? String(req.body.status).trim() : undefined,
      })
      .where(eq(clientsTable.id, clientId))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Klant niet gevonden" });

    if (req.body?.liveSheetUrl !== undefined || req.body?.liveSheetType !== undefined) {
      syncInitialClientSheets(req, clientId);
    }

    if (req.body?.username || req.body?.password || req.body?.name) {
      const values: Partial<typeof usersTable.$inferInsert> = {};
      if (req.body?.username) values.username = String(req.body.username).trim().toLowerCase();
      if (req.body?.password) values.passwordHash = hashPassword(String(req.body.password));
      if (req.body?.name) values.displayName = String(req.body.name).trim();

      await db.update(usersTable).set(values).where(eq(usersTable.clientId, clientId));
    }

    return void res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Failed to update client");
    if (String(err?.message || "").includes("duplicate key")) {
      return void res.status(409).json({ error: "Deze gebruikersnaam bestaat al" });
    }
    return void res.status(500).json({ error: "Klant bijwerken mislukt" });
  }
});

router.delete("/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) return void res.status(404).json({ error: "Klant niet gevonden" });

    await db.transaction(async (tx) => {
      const users = await tx.select().from(usersTable).where(eq(usersTable.clientId, clientId));
      const userIds = users.map((user) => user.id);

      if (userIds.length > 0) {
        await tx.delete(authSessionsTable).where(inArray(authSessionsTable.userId, userIds));
      }

      await tx.delete(exerciseSetLogsTable).where(eq(exerciseSetLogsTable.clientId, clientId));
      await tx.delete(plannedWorkoutExercisesTable).where(eq(plannedWorkoutExercisesTable.clientId, clientId));
      await tx.delete(plannedWorkoutsTable).where(eq(plannedWorkoutsTable.clientId, clientId));
      await tx.delete(nutritionTargetsTable).where(eq(nutritionTargetsTable.clientId, clientId));
      await tx.delete(exerciseLogsTable).where(eq(exerciseLogsTable.clientId, clientId));
      await tx.delete(nutritionEntriesTable).where(eq(nutritionEntriesTable.clientId, clientId));
      await tx.delete(feedbackAnswersTable).where(eq(feedbackAnswersTable.clientId, clientId));
      await tx.delete(progressPhotosTable).where(eq(progressPhotosTable.clientId, clientId));
      await tx.delete(foodLogsTable).where(eq(foodLogsTable.clientId, clientId));
      await tx.delete(usersTable).where(eq(usersTable.clientId, clientId));
      await tx.delete(clientsTable).where(eq(clientsTable.id, clientId));
    });

    const excelPath = getExcelPath(clientId);
    if (fs.existsSync(excelPath)) {
      fs.unlinkSync(excelPath);
    }

    return void res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete client");
    return void res.status(500).json({ error: "Klant verwijderen mislukt" });
  }
});

export default router;
