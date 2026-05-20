import { Router } from "express";
import { db } from "@workspace/db";
import { foodLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Primary: Open Food Facts (no auth, no IP restriction — works immediately)
import { searchFoodsOFF, getFoodDetailOFF, searchByBarcodeOFF } from "../services/openFoodFactsService.js";

// Optional fallback: FatSecret (requires FATSECRET_CLIENT_ID + FATSECRET_CLIENT_SECRET in env
//   AND the Replit server IP whitelisted at platform.fatsecret.com)
import { searchFoods as searchFoodsFS, getFoodDetail as getFoodDetailFS, searchByBarcode as searchByBarcodeFS } from "../services/fatSecretService.js";
import { notifyClients } from "./sync.js";

const router = Router();

const hasFatSecret = !!(process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET);

// ─── FatSecret proxy routes ───────────────────────────────────────────────────

/** GET /api/food/search?q=kip&max=20
 *  Searches Open Food Facts (primary). Falls back to FatSecret if credentials are set.
 */
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return void res.status(400).json({ error: "Zoekterm is vereist" });

  const max = Math.min(parseInt(String(req.query.max || "20"), 10) || 20, 50);

  try {
    // Always try Open Food Facts first
    const results = await searchFoodsOFF(q, max);

    // Optionally supplement with FatSecret if no OFF results and FS is configured
    if (results.length === 0 && hasFatSecret) {
      try {
        const fsResults = await searchFoodsFS(q, max);
        return void res.json({ results: fsResults, source: "fatsecret" });
      } catch (fsErr: any) {
        req.log.warn({ fsErr }, "FatSecret fallback also failed");
      }
    }

    return void res.json({ results, source: "openfoodfacts" });
  } catch (err: any) {
    req.log.error({ err }, "Food search failed");
    return void res.status(500).json({ error: "Zoeken mislukt. Probeer het opnieuw." });
  }
});

/** GET /api/food/barcode?code=8710400100 */
router.get("/barcode", async (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return void res.status(400).json({ error: "Barcode is vereist" });

  try {
    // Try Open Food Facts first
    const result = await searchByBarcodeOFF(code);
    if (result) return void res.json({ ...result, source: "openfoodfacts" });

    // Fallback to FatSecret if configured
    if (hasFatSecret) {
      try {
        const fsResult = await searchByBarcodeFS(code);
        if (fsResult) return void res.json({ ...fsResult, source: "fatsecret" });
      } catch { /* ignore */ }
    }

    return void res.status(404).json({ error: "Product niet gevonden voor deze barcode" });
  } catch (err: any) {
    req.log.error({ err }, "Barcode lookup failed");
    return void res.status(500).json({ error: "Barcode zoeken mislukt." });
  }
});

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
      .where(and(eq(foodLogsTable.weekNumber, weekNumber), eq(foodLogsTable.day, day)));
    return void res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Failed to get food logs");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** GET /api/food/:id — get full food detail + servings */
router.get("/:foodId", async (req, res) => {
  const foodId = req.params.foodId;
  try {
    // Try OFF first
    const detail = await getFoodDetailOFF(foodId);
    if (detail) return void res.json({ ...detail, source: "openfoodfacts" });

    // Fallback to FatSecret
    if (hasFatSecret) {
      try {
        const fsDetail = await getFoodDetailFS(foodId);
        return void res.json({ ...fsDetail, source: "fatsecret" });
      } catch (fsErr: any) {
        if (fsErr.code === 21) {
          return void res.status(503).json({ error: "Voedingsdatabase niet beschikbaar", code: 21 });
        }
      }
    }

    return void res.status(404).json({ error: "Product niet gevonden" });
  } catch (err: any) {
    req.log.error({ err }, "Food detail fetch failed");
    return void res.status(500).json({ error: "Voedingsinfo ophalen mislukt." });
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
        fatSecretFoodId:   String(fatSecretFoodId),
        fatSecretServingId: String(fatSecretServingId),
        foodName:          String(foodName),
        servingDescription: String(servingDescription || ""),
        amountServings:    String(parseFloat(amountServings || "1")),
        kcal:              kcal != null ? String(Math.round(parseFloat(kcal))) : null,
        eiwittenG:         eiwittenG != null ? String(parseFloat(eiwittenG)) : null,
        koolhydratenG:     koolhydratenG != null ? String(parseFloat(koolhydratenG)) : null,
        vetenG:            vetenG != null ? String(parseFloat(vetenG)) : null,
        vezelG:            vezelG != null ? String(parseFloat(vezelG)) : null,
      })
      .returning();
    notifyClients("food_logs_updated", { weekNumber, day });
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
    notifyClients("food_logs_updated", { id });
    return void res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete food log");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
