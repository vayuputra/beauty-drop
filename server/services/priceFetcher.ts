import { db } from "../db";
import { products, productOffers, priceHistory, retailers } from "@shared/schema";
import { eq } from "drizzle-orm";

const PYTHON_FETCHER_URL = process.env.PYTHON_FETCHER_URL || "http://localhost:8000";

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
  retailers: string[] = ["nykaa", "amazon_in", "amazon_us", "sephora"]
): Promise<FetchedPrice[]> {
  try {
    const response = await fetch(`${PYTHON_FETCHER_URL}/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: productName,
        brand: brand || null,
        retailers: retailers,
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

  const fetchedPrices = await fetchProductPrices(product.name, product.brand || undefined);

  for (const fetched of fetchedPrices) {
    const retailerName = fetched.retailer.replace('_', ' ').replace('in', 'India').replace('us', '');
    
    const existingRetailers = await db.select().from(retailers);
    const matchedRetailer = existingRetailers.find(r => 
      r.name.toLowerCase().includes(fetched.retailer.split('_')[0])
    );

    if (matchedRetailer && fetched.price > 0) {
      const [existingOffer] = await db.select()
        .from(productOffers)
        .where(eq(productOffers.productId, productId));

      if (existingOffer) {
        await db.insert(priceHistory).values({
          productId,
          retailerId: matchedRetailer.id,
          price: fetched.price,
          currency: fetched.currency as "INR" | "USD"
        });
      }
    }
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
