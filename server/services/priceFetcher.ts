import { db } from "../db";
import { products, productOffers, priceHistory, retailers } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const PYTHON_FETCHER_URL = process.env.PYTHON_FETCHER_URL || "http://localhost:8000";

const RETAILER_SLUG_MAP: Record<string, string> = {
  "nykaa": "Nykaa",
  "amazon_in": "Amazon India",
  "amazon_us": "Amazon",
  "sephora": "Sephora",
  "sephora_in": "Sephora India",
  "ulta": "Ulta Beauty",
  "myntra": "Myntra",
  "purplle": "Purplle"
};

interface FetchedPrice {
  retailer: string;
  price: number;
  currency: string;
  priceUsd: number;
  availability: string;
  imageUrl: string | null;
  imageVerified: boolean;
  productUrl: string | null;
}

interface FetchResponse {
  product_name: string;
  results: Array<{
    product_name: string;
    retailer: string;
    image_url: string | null;
    image_verified: boolean;
    verification_confidence: number | null;
    price: {
      amount: number;
      currency: string;
      amount_usd: number | null;
    } | null;
    availability: string;
    product_url: string | null;
    source: string;
    error: string | null;
  }>;
  cache_hit: boolean;
  fetch_duration_ms: number;
}

export async function fetchProductPrices(
  productName: string,
  brand?: string,
  retailerSlugs: string[] = ["nykaa", "amazon_in", "amazon_us", "sephora"]
): Promise<FetchedPrice[]> {
  try {
    const response = await fetch(`${PYTHON_FETCHER_URL}/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: productName,
        brand: brand || null,
        retailers: retailerSlugs,
        verify_images: true
      })
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const data: FetchResponse = await response.json();

    return data.results.map(r => ({
      retailer: r.retailer,
      price: r.price?.amount || 0,
      currency: r.price?.currency || "USD",
      priceUsd: r.price?.amount_usd || 0,
      availability: r.availability,
      imageUrl: r.image_url,
      imageVerified: r.image_verified,
      productUrl: r.product_url
    }));
  } catch (error) {
    console.error("Price fetch error:", error);
    return [];
  }
}

export async function triggerBackgroundRefresh(
  productName: string,
  brand?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${PYTHON_FETCHER_URL}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: productName,
        brand: brand || null
      })
    });

    return response.ok;
  } catch (error) {
    console.error("Background refresh trigger error:", error);
    return false;
  }
}

export async function updateProductPricesFromFetch(productId: number): Promise<void> {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return;

  const country = product.country || "US";
  const retailerSlugs = country === "IN" 
    ? ["nykaa", "amazon_in", "purplle", "myntra"]
    : ["amazon_us", "sephora", "ulta"];

  const fetchedPrices = await fetchProductPrices(
    product.name, 
    product.brand || undefined,
    retailerSlugs
  );

  const allRetailers = await db.select().from(retailers);

  for (const fetched of fetchedPrices) {
    if (fetched.price <= 0) continue;

    const retailerName = RETAILER_SLUG_MAP[fetched.retailer];
    if (!retailerName) continue;

    const matchedRetailer = allRetailers.find(r => r.name === retailerName);
    if (!matchedRetailer) continue;

    const [existingOffer] = await db.select()
      .from(productOffers)
      .where(and(
        eq(productOffers.productId, productId),
        eq(productOffers.retailerId, matchedRetailer.id)
      ));

    const affiliateUrl = fetched.productUrl || `https://${retailerName.toLowerCase().replace(' ', '')}.com`;
    const currency = fetched.currency as "INR" | "USD";

    if (existingOffer) {
      await db.update(productOffers)
        .set({
          price: fetched.price,
          affiliateUrl: fetched.productUrl || existingOffer.affiliateUrl
        })
        .where(eq(productOffers.id, existingOffer.id));
    } else {
      await db.insert(productOffers).values({
        productId,
        retailerId: matchedRetailer.id,
        price: fetched.price,
        currency,
        affiliateUrl
      });
    }

    await db.insert(priceHistory).values({
      productId,
      retailerId: matchedRetailer.id,
      price: fetched.price,
      currency
    });
  }
}

export async function checkPythonFetcherHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PYTHON_FETCHER_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
