import { fetchJson } from "./http";
import { titleMatchesProduct } from "./text";

/** Subset of SerpAPI's Google Shopping result (engine=google_shopping). */
export interface ShoppingResultJson {
  title?: string;
  source?: string;
  link?: string;
  product_link?: string;
  extracted_price?: number;
  extracted_old_price?: number;
  second_hand_condition?: string;
}

export interface SellerOffer {
  seller: string;
  title: string;
  price: number;
  listPrice: number | null;
  url: string;
}

// Listings that mention the product but aren't it.
const NOT_THE_PRODUCT = /\b(dupe|inspired by|alternative to|compatible with|refill only|empty|case for|holder|organizer|pack of \d+|lot of|bundle)\b/i;

function httpsUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the cheapest matching new-condition listing per seller.
 * Titles must name the brand and most of the product name, so similar
 * products or dupes don't get compared as if they were the same thing.
 */
export function pickSellerOffers(results: ShoppingResultJson[], brand: string, productName: string): SellerOffer[] {
  const bySeller = new Map<string, SellerOffer>();
  for (const r of results) {
    const title = r.title?.trim();
    const seller = r.source?.trim();
    const price = r.extracted_price;
    const url = httpsUrl(r.link) ?? httpsUrl(r.product_link);
    if (!title || !seller || !url || typeof price !== "number" || !(price > 0)) continue;
    if (r.second_hand_condition) continue;
    if (NOT_THE_PRODUCT.test(title)) continue;
    if (!titleMatchesProduct(title, brand, productName)) continue;

    const key = seller.toLowerCase();
    const existing = bySeller.get(key);
    if (existing && existing.price <= price) continue;
    const old = r.extracted_old_price;
    bySeller.set(key, {
      seller,
      title,
      price,
      listPrice: typeof old === "number" && old > price ? old : null,
      url,
    });
  }
  return Array.from(bySeller.values()).sort((a, b) => a.price - b.price);
}

export function isGoogleShoppingConfigured(): boolean {
  return !!process.env.SERPAPI_KEY;
}

export async function searchGoogleShopping(query: string, country: "IN" | "US"): Promise<ShoppingResultJson[]> {
  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    gl: country === "IN" ? "in" : "us",
    hl: "en",
    api_key: process.env.SERPAPI_KEY ?? "",
  });
  const json = await fetchJson<{ shopping_results?: ShoppingResultJson[]; error?: string }>(
    `https://serpapi.com/search.json?${params}`,
    { timeoutMs: 20_000 },
  );
  if (json.error) throw new Error(`SerpAPI: ${json.error}`);
  return json.shopping_results ?? [];
}
