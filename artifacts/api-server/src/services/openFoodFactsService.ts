/**
 * openFoodFactsService.ts – robust multi-endpoint Open Food Facts integration
 * Tries multiple endpoints in sequence until one succeeds.
 */

import { logger } from "../lib/logger.js";

const HEADERS = { "User-Agent": "FitnessTracker/1.0 (personal app)" };
const TIMEOUT_MS = 8000;

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface FoodSearchResult {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_description: string;
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
  nutriments?: Record<string, number>;
}

async function safeFetch(url: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null; // HTML maintenance page
    return await res.json();
  } catch {
    return null;
  }
}

function productToSearchResult(p: OFFProduct): FoodSearchResult | null {
  const name = p.product_name_nl || p.product_name;
  if (!name) return null;
  const n = p.nutriments ?? {};
  const kcal  = n["energy-kcal_100g"] ?? 0;
  const fat   = +(n["fat_100g"] ?? 0).toFixed(1);
  const carbs = +(n["carbohydrates_100g"] ?? 0).toFixed(1);
  const prot  = +(n["proteins_100g"] ?? 0).toFixed(1);
  return {
    food_id:          p.id || p.code || "",
    food_name:        name,
    brand_name:       p.brands || undefined,
    food_description: `Per 100g – ${Math.round(kcal)} kcal | Vet: ${fat}g | Koolh: ${carbs}g | Eiwit: ${prot}g`,
  };
}

function productToDetail(p: OFFProduct): FoodDetail | null {
  const name = p.product_name_nl || p.product_name;
  if (!name) return null;
  const n = p.nutriments ?? {};

  const per100: Serving = {
    serving_id:          "100g",
    serving_description: "100 gram",
    calories:   String(Math.round(n["energy-kcal_100g"] ?? 0)),
    protein:    String(+(n["proteins_100g"] ?? 0).toFixed(1)),
    carbohydrate: String(+(n["carbohydrates_100g"] ?? 0).toFixed(1)),
    fat:        String(+(n["fat_100g"] ?? 0).toFixed(1)),
    fiber:      n["fiber_100g"] != null ? String(+(n["fiber_100g"]).toFixed(1)) : undefined,
  };

  const servings: Serving[] = [per100];

  // Add serving size if available
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

  // Common portions
  for (const [id, desc, factor] of [
    ["50g", "50 gram", 0.5],
    ["150g", "150 gram", 1.5],
    ["200g", "200 gram", 2.0],
    ["250g", "250 gram", 2.5],
  ] as [string, string, number][]) {
    servings.push({
      serving_id:          id,
      serving_description: desc,
      calories:   String(Math.round(parseFloat(per100.calories) * factor)),
      protein:    String(+(parseFloat(per100.protein)    * factor).toFixed(1)),
      carbohydrate: String(+(parseFloat(per100.carbohydrate) * factor).toFixed(1)),
      fat:        String(+(parseFloat(per100.fat)       * factor).toFixed(1)),
      fiber:      per100.fiber ? String(+(parseFloat(per100.fiber) * factor).toFixed(1)) : undefined,
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

// ─── Search – tries multiple OFF endpoints ────────────────────────────────────

export async function searchFoodsOFF(query: string, maxResults = 20): Promise<FoodSearchResult[]> {
  const encoded = encodeURIComponent(query);

  // Endpoint 1: OFF v2 search
  const data1 = await safeFetch(
    `https://world.openfoodfacts.org/api/v2/search?q=${encoded}&page_size=${maxResults}&fields=id,code,product_name,product_name_nl,brands,nutriments,serving_size`
  );
  if (data1?.products?.length) {
    logger.info({ count: data1.products.length, source: "OFF v2" }, "Food search success");
    return (data1.products as OFFProduct[])
      .map(productToSearchResult)
      .filter((r): r is FoodSearchResult => r !== null);
  }

  // Endpoint 2: OFF cgi search (legacy)
  const data2 = await safeFetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&json=true&page_size=${maxResults}&fields=id,code,product_name,product_name_nl,brands,nutriments,serving_size&action=process`
  );
  if (data2?.products?.length) {
    logger.info({ count: data2.products.length, source: "OFF cgi" }, "Food search success");
    return (data2.products as OFFProduct[])
      .map(productToSearchResult)
      .filter((r): r is FoodSearchResult => r !== null);
  }

  logger.warn({ query }, "Open Food Facts search returned no results from any endpoint");
  return [];
}

// ─── Product detail by ID / barcode ──────────────────────────────────────────

export async function getFoodDetailOFF(id: string): Promise<FoodDetail | null> {
  // Try v3 product endpoint
  const data = await safeFetch(
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(id)}.json?fields=id,code,product_name,product_name_nl,brands,nutriments,serving_size`
  );
  if (data?.product) return productToDetail(data.product);

  // Try v2 product endpoint
  const data2 = await safeFetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(id)}.json?fields=id,code,product_name,product_name_nl,brands,nutriments,serving_size`
  );
  if (data2?.product) return productToDetail(data2.product);

  return null;
}

/** Barcode lookup */
export async function searchByBarcodeOFF(barcode: string): Promise<FoodDetail | null> {
  return getFoodDetailOFF(barcode);
}
