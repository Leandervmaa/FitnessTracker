import { Router } from "express";
import { db } from "@workspace/db";
import { foodLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { searchFoods, getFoodDetail, searchByBarcode } from "../services/fatSecretService.js";

const router = Router();

// ─── FatSecret proxy routes ───────────────────────────────────────────────────

/** GET /api/food/search?q=kip&max=20 */
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return void res.status(400).json({ error: "Zoekterm is vereist" });

  const max = Math.min(parseInt(String(req.query.max || "20"), 10) || 20, 50);

  try {
    const results = await searchFoods(q, max);
    return void res.json({ results });
  } catch (err: any) {
    req.log.error({ err }, "FatSecret search failed");
    if (err.code === 21) {
      return void res.status(503).json({
        error: "Voedingsdatabase tijdelijk niet beschikbaar (IP-whitelisting vereist)",
        code: 21,
      });
    }
    return void res.status(500).json({ error: "Zoeken mislukt. Probeer het opnieuw." });
  }
});

/** GET /api/food/barcode?code=8711327526464 */
router.get("/barcode", async (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return void res.status(400).json({ error: "Barcode is vereist" });

  try {
    const result = await searchByBarcode(code);
    if (!result) return void res.status(404).json({ error: "Product niet gevonden voor deze barcode" });
    return void res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "FatSecret barcode lookup failed");
    return void res.status(500).json({ error: "Barcode zoeken mislukt." });
  }
});

/** GET /api/food/:id — get full food detail + servings */
router.get("/:foodId", async (req, res) => {
  const foodId = req.params.foodId;
  try {
    const detail = await getFoodDetail(foodId);
    return void res.json(detail);
  } catch (err: any) {
    req.log.error({ err }, "FatSecret food.get failed");
    if (err.code === 21) {
      return void res.status(503).json({ error: "Voedingsdatabase niet beschikbaar", code: 21 });
    }
    return void res.status(500).json({ error: "Voedingsinfo ophalen mislukt." });
  }
});

// ─── Food log CRUD ────────────────────────────────────────────────────────────

/** GET /api/food/logs?weekNumber=1&day=mon */
router.get("/logs", async (req, res) => {
  const weekNumber = parseInt(String(req.query.weekNumber || ""), 10);
  const day = String(req.query.day || "").trim();

  if (isNaN(weekNumber) || !day) {
    return void res.status(400).json({ error: "weekNumber en day zijn vereist" });
  }

  try {
    const logs = await db
      .select()
      .from(foodLogsTable)
      .where(
        and(
          eq(foodLogsTable.weekNumber, weekNumber),
          eq(foodLogsTable.day, day)
        )
      );
    return void res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Failed to get food logs");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** POST /api/food/logs — log a food item */
router.post("/logs", async (req, res) => {
  const {
    weekNumber, day, fatSecretFoodId, fatSecretServingId,
    foodName, servingDescription, amountServings,
    kcal, eiwittenG, koolhydratenG, vetenG, vezelG,
  } = req.body;

  if (!weekNumber || !day || !fatSecretFoodId || !foodName) {
    return void res.status(400).json({ error: "Ongeldige invoer" });
  }

  try {
    const [log] = await db
      .insert(foodLogsTable)
      .values({
        weekNumber: parseInt(weekNumber, 10),
        day,
        fatSecretFoodId: String(fatSecretFoodId),
        fatSecretServingId: String(fatSecretServingId),
        foodName: String(foodName),
        servingDescription: String(servingDescription || ""),
        amountServings: String(parseFloat(amountServings || "1")),
        kcal: kcal != null ? String(Math.round(parseFloat(kcal))) : null,
        eiwittenG: eiwittenG != null ? String(parseFloat(eiwittenG)) : null,
        koolhydratenG: koolhydratenG != null ? String(parseFloat(koolhydratenG)) : null,
        vetenG: vetenG != null ? String(parseFloat(vetenG)) : null,
        vezelG: vezelG != null ? String(parseFloat(vezelG)) : null,
      })
      .returning();
    return void res.status(201).json(log);
  } catch (err) {
    req.log.error({ err }, "Failed to insert food log");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** DELETE /api/food/logs/:id */
router.delete("/logs/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });

  try {
    const [deleted] = await db
      .delete(foodLogsTable)
      .where(eq(foodLogsTable.id, id))
      .returning();

    if (!deleted) return void res.status(404).json({ error: "Log niet gevonden" });
    return void res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete food log");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
