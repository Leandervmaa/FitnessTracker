import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientsTable, usersTable } from "@workspace/db";
import { createClientWithUser, hashPassword, publicUser } from "../services/identityService.js";
import { requireTrainer } from "../lib/auth.js";
import { extractGoogleSheetId } from "../services/clientSheetService.js";

const router = Router();

router.use(requireTrainer);

router.get("/", async (req, res) => {
  try {
    const clients = await db.select().from(clientsTable);
    const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
    const userByClient = new Map(users.map((u) => [u.clientId, publicUser(u)]));

    return void res.json(
      clients.map((client) => ({
        ...client,
        user: userByClient.get(client.id) ?? null,
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

    const result = await createClientWithUser({
      name,
      username,
      password,
      email: req.body?.email ? String(req.body.email).trim() : null,
      phone: req.body?.phone ? String(req.body.phone).trim() : null,
      goal: req.body?.goal ? String(req.body.goal).trim() : null,
      notes: req.body?.notes ? String(req.body.notes).trim() : null,
      liveSheetType: req.body?.liveSheetType ? String(req.body.liveSheetType).trim() : null,
      liveSheetUrl: req.body?.liveSheetUrl ? String(req.body.liveSheetUrl).trim() : null,
      liveSheetId: extractGoogleSheetId(req.body?.liveSheetUrl ? String(req.body.liveSheetUrl) : null),
    });

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
    const [updated] = await db
      .update(clientsTable)
      .set({
        name: req.body?.name ? String(req.body.name).trim() : undefined,
        email: req.body?.email !== undefined ? String(req.body.email || "").trim() || null : undefined,
        phone: req.body?.phone !== undefined ? String(req.body.phone || "").trim() || null : undefined,
        goal: req.body?.goal !== undefined ? String(req.body.goal || "").trim() || null : undefined,
        notes: req.body?.notes !== undefined ? String(req.body.notes || "").trim() || null : undefined,
        liveSheetType: req.body?.liveSheetType !== undefined ? String(req.body.liveSheetType || "").trim() || null : undefined,
        liveSheetUrl: req.body?.liveSheetUrl !== undefined ? String(req.body.liveSheetUrl || "").trim() || null : undefined,
        liveSheetId: req.body?.liveSheetUrl !== undefined ? extractGoogleSheetId(String(req.body.liveSheetUrl || "")) : undefined,
        status: req.body?.status ? String(req.body.status).trim() : undefined,
      })
      .where(eq(clientsTable.id, clientId))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Klant niet gevonden" });

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

export default router;
