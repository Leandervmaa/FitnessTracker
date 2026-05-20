/**
 * openFoodFactsService.ts
 *
 * Wraps the Open Food Facts API — completely free, no auth, no IP whitelist.
 * International database with good Dutch product coverage + barcode support.
 *
 * Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 */

import { logger } from "../lib/logger.js";

const BASE = "https://world.openfoodfacts.org";

// ─── Shared types (same shape as FatSecret so the route can be neutral) ──────

export interface FoodSearchResult {
  food_id: string;          // barcode / OFF id
  food_name: string;
  brand_name?: string;
  food_description: string; // "Per 100g – Calories: Xkcal | Fat: Yg | …"
}

export interface Serving {
  serving_id: string;
  serving_description: string;
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  fiber?: string;
}

export interface FoodDetail {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type: string;
  servings: Serving[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface OFFProduct {
  id?: string;
  code?: string;
  product_name?: string;
  product_name_nl?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "proteins_100g"?: number;
    "carbohydrates_100g"?: number;
    "fat_100g"?: number;
    "fiber_100g"?: number;
    "energy-kcal_serving"?: number;
    "proteins_serving"?: number;
    "carbohydrates_serving"?: number;
    "fat_serving"?: number;
    "fiber_serving"?: number;
  };
}

function productToSearchResult(p: OFFProduct): FoodSearchResult | null {
  const name = p.product_name_nl || p.product_name;
  if (!name) return null;
  const n = p.nutriments ?? {};
  const kcal  = n["energy-kcal_100g"] ?? 0;
  const prot  = n["proteins_100g"] ?? 0;
  const carbs = n["carbohydrates_100g"] ?? 0;
  const fat   = n["fat_100g"] ?? 0;
  const desc  = `Per 100g – Calories: ${Math.round(kcal)}kcal | Vet: ${fat.toFixed(1)}g | Koolh: ${carbs.toFixed(1)}g | Eiwit: ${prot.toFixed(1)}g`;
  return {
    food_id:          p.id || p.code || "",
    food_name:        name,
    brand_name:       p.brands || undefined,
    food_description: desc,
  };
}

function productToDetail(p: OFFProduct): FoodDetail | null {
  const name = p.product_name_nl || p.product_name;
  if (!name) return null;
  const n = p.nutriments ?? {};
  const servings: Serving[] = [];

  // Always add a 100g serving
  servings.push({
    serving_id:          "100g",
    serving_description: "100 gram",
    calories:   String(Math.round(n["energy-kcal_100g"] ?? 0)),
    protein:    String(+(n["proteins_100g"] ?? 0).toFixed(1)),
    carbohydrate: String(+(n["carbohydrates_100g"] ?? 0).toFixed(1)),
    fat:        String(+(n["fat_100g"] ?? 0).toFixed(1)),
    fiber:      n["fiber_100g"] != null ? String(+(n["fiber_100g"]).toFixed(1)) : undefined,
  });

  // Add a per-serving entry if the product has serving info
  if (p.serving_size && n["energy-kcal_serving"] != null) {
    servings.push({
      serving_id:          "serving",
      serving_description: `1 portie (${p.serving_size})`,
      calories:   String(Math.round(n["energy-kcal_serving"] ?? 0)),
      protein:    String(+(n["proteins_serving"] ?? 0).toFixed(1)),
      carbohydrate: String(+(n["carbohydrates_serving"] ?? 0).toFixed(1)),
      fat:        String(+(n["fat_serving"] ?? 0).toFixed(1)),
      fiber:      n["fiber_serving"] != null ? String(+(n["fiber_serving"]).toFixed(1)) : undefined,
    });
  }

  // Common portion sizes
  const portions: Array<[string, string, number]> = [
    ["1_stuks",  "1 stuk (±30g)",    0.30],
    ["half",     "½ portie (50g)",    0.50],
    ["200g",     "200 gram",          2.00],
    ["250g",     "250 gram",          2.50],
  ];
  const base100 = servings[0];
  for (const [sid, sdesc, factor] of portions) {
    servings.push({
      serving_id:          sid,
      serving_description: sdesc,
      calories:   String(Math.round(parseFloat(base100.calories) * factor)),
      protein:    String(+(parseFloat(base100.protein)    * factor).toFixed(1)),
      carbohydrate: String(+(parseFloat(base100.carbohydrate) * factor).toFixed(1)),
      fat:        String(+(parseFloat(base100.fat)       * factor).toFixed(1)),
      fiber:      base100.fiber ? String(+(parseFloat(base100.fiber) * factor).toFixed(1)) : undefined,
    });
  }

  return {
    food_id:   p.id || p.code || "",
    food_name: name,
    brand_name: p.brands || undefined,
    food_type: "Generic",
    servings,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Search for foods by name. */
export async function searchFoodsOFF(query: string, maxResults = 20): Promise<FoodSearchResult[]> {
  const params = new URLSearchParams({
    search_terms: query,
    json:         "true",
    page_size:    String(maxResults),
    fields:       "id,code,product_name,product_name_nl,brands,nutriments,serving_size,serving_quantity",
    sort_by:      "unique_scans_n",
  });

  try {
    const res = await fetch(`${BASE}/cgi/search.pl?${params}`, {
      headers: { "User-Agent": "FitnessTracker/1.0 (contact@example.com)" },
    });
    if (!res.ok) throw new Error(`OFF search HTTP ${res.status}`);

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) {
      logger.warn("Open Food Facts returned non-JSON response (maintenance?)");
      return [];
    }

    const data = await res.json() as { products?: OFFProduct[] };
    const products = data.products ?? [];
    return products
      .map(productToSearchResult)
      .filter((r): r is FoodSearchResult => r !== null && r.food_id !== "");
  } catch (err) {
    logger.error({ err }, "Open Food Facts search failed");
    return [];
  }
}

/** Get full detail + servings for a product by barcode or OFF id. */
export async function getFoodDetailOFF(id: string): Promise<FoodDetail | null> {
  try {
    const res = await fetch(`${BASE}/api/v3/product/${encodeURIComponent(id)}.json?fields=id,code,product_name,product_name_nl,brands,nutriments,serving_size,serving_quantity`, {
      headers: { "User-Agent": "FitnessTracker/1.0 (contact@example.com)" },
    });
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) {
      logger.warn("Open Food Facts product detail returned non-JSON");
      return null;
    }

    const data = await res.json() as { product?: OFFProduct; status?: string };
    if (data.status === "product_not_found" || !data.product) return null;
    return productToDetail(data.product);
  } catch (err) {
    logger.error({ err, id }, "Open Food Facts product detail failed");
    return null;
  }
}

/** Barcode lookup (EAN/UPC). */
export async function searchByBarcodeOFF(barcode: string): Promise<FoodDetail | null> {
  return getFoodDetailOFF(barcode);
}
