/**
 * fatSecretService.ts
 * Proxies calls to the FatSecret Platform API (OAuth2 client credentials).
 * Caches the access token for up to 23 hours.
 *
 * ⚠️  IMPORTANT: The FatSecret API requires IP whitelisting.
 *     Add the deployment server's IP to the allowed list at:
 *     https://platform.fatsecret.com/api/ → My Applications → [your app] → Allowed IPs
 */

import { logger } from "../lib/logger.js";

const CLIENT_ID = "a9ca25190329443e992cd013fc041aa2";
const CLIENT_SECRET = "6f3ccd9065954db395b8f2780ecc70eb";
const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const API_URL = "https://platform.fatsecret.com/rest/server.api";

// ─── Token cache ──────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "basic",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`FatSecret token request failed: ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };

  cachedToken = data.access_token;
  // Expire 60 min before actual expiry for safety
  tokenExpiresAt = Date.now() + (data.expires_in - 3600) * 1000;
  return cachedToken;
}

// ─── API call helper ──────────────────────────────────────────────────────────

async function callApi(params: Record<string, string>): Promise<any> {
  const token = await getAccessToken();
  const url = new URL(API_URL);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  if (data.error) {
    logger.warn({ code: data.error.code, msg: data.error.message }, "FatSecret API error");
    throw Object.assign(new Error(data.error.message as string), { code: data.error.code as number });
  }
  return data;
}

// ─── Typed interfaces ─────────────────────────────────────────────────────────

export interface FoodSearchResult {
  food_id: string;
  food_name: string;
  food_type: string;
  brand_name?: string;
  food_description: string; // e.g. "Per 100g - Calories: 165kcal | Fat: 3.57g | Carbs: 0g | Protein: 31.02g"
}

export interface Serving {
  serving_id: string;
  serving_description: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  number_of_units?: string;
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  fiber?: string;
  sugar?: string;
}

export interface FoodDetail {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type: string;
  servings: Serving[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Search for foods by name. Returns up to `maxResults` results. */
export async function searchFoods(query: string, maxResults = 20): Promise<FoodSearchResult[]> {
  const data = await callApi({
    method: "foods.search",
    search_expression: query,
    max_results: String(maxResults),
    language: "nl",
    region: "NL",
  });

  const foods = data.foods?.food;
  if (!foods) return [];
  return Array.isArray(foods) ? foods : [foods];
}

/** Get full details (all servings) for a specific food. */
export async function getFoodDetail(foodId: string): Promise<FoodDetail> {
  const data = await callApi({ method: "food.get.v4", food_id: foodId });
  const food = data.food;

  let servings: Serving[] = [];
  if (food.servings?.serving) {
    const s = food.servings.serving;
    servings = Array.isArray(s) ? s : [s];
  }

  return {
    food_id: food.food_id,
    food_name: food.food_name,
    brand_name: food.brand_name,
    food_type: food.food_type,
    servings,
  };
}

/** Search foods by barcode (EAN/UPC). */
export async function searchByBarcode(barcode: string): Promise<FoodDetail | null> {
  try {
    const data = await callApi({ method: "food.find_by_barcode", barcode });
    if (!data.food?.food_id) return null;
    return getFoodDetail(data.food.food_id);
  } catch {
    return null;
  }
}
