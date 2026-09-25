import { fetchJson } from "./http";
import { htmlToText } from "./text";
import { mapCategory, type Category } from "./category";

/** Subset of Shopify's public storefront product JSON (`/products.json`). */
export interface ShopifyVariantJson {
  id: number;
  title: string;
  sku?: string | null;
  price: string;
  compare_at_price?: string | null;
  available?: boolean;
  position?: number;
  featured_image?: { src?: string } | null;
}

export interface ShopifyProductJson {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[] | string;
  published_at?: string | null;
  created_at?: string | null;
  variants?: ShopifyVariantJson[];
  images?: { src: string; position?: number }[];
}

export interface ParsedVariant {
  externalId: string;
  title: string;
  sku: string | null;
  price: number | null;
  listPrice: number | null;
  available: boolean | null;
  imageUrl: string | null;
  position: number;
}

export interface ParsedProduct {
  sourceKey: string;
  externalId: string;
  name: string;
  handle: string;
  productUrl: string;
  description: string;
  category: Category;
  imageUrl: string | null;
  launchedAt: Date | null;
  variants: ParsedVariant[];
  /** Cheapest buyable variant (or cheapest overall when all are sold out). */
  price: number | null;
  listPrice: number | null;
  inStock: boolean;
}

// Store add-ons that aren't beauty products.
const NON_PRODUCT = /\b(gift ?card|e-?gift|egift|gift wrap|shipping protection|route protection|package protection|insurance|donation|sample|tester|free gift)\b/i;

function toPrice(s: string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function shopifySourceKey(domain: string, productId: number | string): string {
  return `shopify:${domain}:${productId}`;
}

/** Normalizes one storefront product. Returns null for add-ons, unpublished items and priceless listings. */
export function parseShopifyProduct(p: ShopifyProductJson, domain: string): ParsedProduct | null {
  if (!p || typeof p.id !== "number" || !p.title || !p.handle) return null;
  const tags = Array.isArray(p.tags) ? p.tags : typeof p.tags === "string" ? p.tags.split(",").map((t) => t.trim()) : [];
  if (NON_PRODUCT.test(p.title) || NON_PRODUCT.test(p.product_type ?? "")) return null;
  if (p.published_at === null) return null; // unpublished

  const variants: ParsedVariant[] = (p.variants ?? []).map((v, i) => {
    const price = toPrice(v.price);
    const compareAt = toPrice(v.compare_at_price);
    return {
      externalId: String(v.id),
      title: v.title && v.title !== "Default Title" ? v.title : p.title,
      sku: v.sku || null,
      price,
      listPrice: compareAt != null && price != null && compareAt > price ? compareAt : null,
      available: typeof v.available === "boolean" ? v.available : null,
      imageUrl: v.featured_image?.src ?? null,
      position: v.position ?? i + 1,
    };
  });

  const priced = variants.filter((v) => v.price != null);
  if (priced.length === 0) return null;
  const buyable = priced.filter((v) => v.available !== false);
  const pool = buyable.length > 0 ? buyable : priced;
  const cheapest = pool.reduce((a, b) => (b.price! < a.price! ? b : a));

  const images = [...(p.images ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return {
    sourceKey: shopifySourceKey(domain, p.id),
    externalId: String(p.id),
    name: p.title.trim(),
    handle: p.handle,
    productUrl: `https://${domain}/products/${encodeURIComponent(p.handle)}`,
    description: htmlToText(p.body_html) || p.title.trim(),
    category: mapCategory(p.product_type, tags, p.title),
    imageUrl: images[0]?.src ?? cheapest.imageUrl ?? null,
    launchedAt: toDate(p.published_at) ?? toDate(p.created_at),
    variants,
    price: cheapest.price,
    listPrice: cheapest.listPrice,
    inStock: buyable.length > 0,
  };
}

export function parseShopifyProducts(json: unknown, domain: string): ParsedProduct[] {
  const list = (json as { products?: ShopifyProductJson[] })?.products;
  if (!Array.isArray(list)) throw new Error(`Unexpected products.json shape from ${domain}`);
  return list.map((p) => parseShopifyProduct(p, domain)).filter((p): p is ParsedProduct => p !== null);
}

/** Fetches one page (up to 250 products) of a store's public catalog. */
export async function fetchShopifyProductsPage(domain: string, page: number): Promise<ParsedProduct[]> {
  const json = await fetchJson(`https://${domain}/products.json?limit=250&page=${page}`);
  return parseShopifyProducts(json, domain);
}

/** True if a product counts as a new drop: published within the window. */
export function isRecentLaunch(launchedAt: Date | null, now: Date, windowDays: number): boolean {
  if (!launchedAt) return false;
  const age = now.getTime() - launchedAt.getTime();
  return age >= -24 * 3600_000 && age <= windowDays * 24 * 3600_000;
}
