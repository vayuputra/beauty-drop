import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { priceHistory, productOffers, productVariants, retailers, type Retailer } from "@shared/schema";
import type { ParsedVariant } from "./shopify";

export type OfferSource = "brand_site" | "google_shopping" | "manual" | "demo";

// Google Shopping seller names → the names we already use for those retailers.
const SELLER_ALIASES: Record<string, string> = {
  "amazon.com": "Amazon",
  "amazon.com - seller": "Amazon",
  "amazon.in": "Amazon India",
  "amazon india": "Amazon India",
  ulta: "Ulta Beauty",
  "ulta.com": "Ulta Beauty",
  "sephora.com": "Sephora",
  "nykaa.com": "Nykaa",
  "myntra.com": "Myntra",
  "tata cliq": "Tata CLiQ",
  "tatacliq.com": "Tata CLiQ",
  "purplle.com": "Purplle",
};

export function canonicalSellerName(seller: string): string {
  const key = seller.trim().toLowerCase();
  return SELLER_ALIASES[key] ?? seller.trim();
}

export function sameName(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n(a) === n(b);
}

export async function findOrCreateRetailer(input: {
  name: string;
  country: string;
  domain?: string | null;
  kind?: "retailer" | "brand";
}): Promise<Retailer> {
  const existing = await db.select().from(retailers).where(eq(retailers.country, input.country));
  const match = existing.find((r) => sameName(r.name, input.name));
  if (match) {
    if ((input.domain && !match.domain) || (input.kind === "brand" && match.kind !== "brand")) {
      const [updated] = await db
        .update(retailers)
        .set({ domain: match.domain ?? input.domain ?? null, kind: input.kind ?? match.kind })
        .where(eq(retailers.id, match.id))
        .returning();
      return updated;
    }
    return match;
  }
  const [created] = await db
    .insert(retailers)
    .values({ name: input.name, country: input.country, domain: input.domain ?? null, kind: input.kind ?? "retailer" })
    .returning();
  return created;
}

export interface OfferInput {
  productId: number;
  retailerId: number;
  price: number;
  currency: string;
  url: string;
  source: OfferSource;
  listPrice?: number | null;
  inStock?: boolean | null;
}

/**
 * Inserts or updates the (product, retailer) offer and appends price history
 * when the price is new or changed. Returns whether the price changed.
 */
export async function upsertOffer(o: OfferInput): Promise<{ created: boolean; priceChanged: boolean }> {
  const [existing] = await db
    .select()
    .from(productOffers)
    .where(and(eq(productOffers.productId, o.productId), eq(productOffers.retailerId, o.retailerId)));

  const values = {
    price: o.price,
    currency: o.currency,
    affiliateUrl: o.url,
    source: o.source,
    listPrice: o.listPrice ?? null,
    inStock: o.inStock ?? null,
    lastUpdated: new Date(),
  };

  const priceChanged = !existing || existing.price !== o.price || existing.source === "demo";
  if (existing) {
    await db.update(productOffers).set(values).where(eq(productOffers.id, existing.id));
  } else {
    await db.insert(productOffers).values({ productId: o.productId, retailerId: o.retailerId, ...values });
  }
  if (priceChanged) {
    await db.insert(priceHistory).values({
      productId: o.productId,
      retailerId: o.retailerId,
      price: o.price,
      currency: o.currency,
      source: o.source,
    });
  }
  return { created: !existing, priceChanged };
}

/** Placeholder demo prices go away as soon as a product has real ones. */
export async function removeDemoOffers(productId: number): Promise<void> {
  await db.delete(productOffers).where(and(eq(productOffers.productId, productId), eq(productOffers.source, "demo")));
}

export async function upsertVariants(productId: number, variants: ParsedVariant[]): Promise<void> {
  if (variants.length === 0) return;
  await db
    .insert(productVariants)
    .values(variants.map((v) => ({ productId, ...v })))
    .onConflictDoUpdate({
      target: [productVariants.productId, productVariants.externalId],
      set: {
        title: sql`excluded.title`,
        sku: sql`excluded.sku`,
        price: sql`excluded.price`,
        listPrice: sql`excluded.list_price`,
        available: sql`excluded.available`,
        imageUrl: sql`excluded.image_url`,
        position: sql`excluded.position`,
      },
    });
  // Variants the store no longer lists.
  const keep = variants.map((v) => v.externalId);
  const current = await db
    .select({ id: productVariants.id, externalId: productVariants.externalId })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  const stale = current.filter((v) => !keep.includes(v.externalId)).map((v) => v.id);
  if (stale.length > 0) await db.delete(productVariants).where(inArray(productVariants.id, stale));
}
