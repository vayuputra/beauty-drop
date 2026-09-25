import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { cache } from "../services/cache";
import {
  brandSources,
  ingestionRuns,
  productVideos,
  products,
  type BrandSource,
  type IngestionRun,
  type Product,
} from "@shared/schema";
import { fetchShopifyProductsPage, isRecentLaunch, type ParsedProduct } from "./shopify";
import { isGoogleShoppingConfigured, pickSellerOffers, searchGoogleShopping } from "./googleShopping";
import { isYouTubeConfigured, pickProductVideos, searchYouTube } from "./youtube";
import { canonicalSellerName, findOrCreateRetailer, removeDemoOffers, sameName, upsertOffer, upsertVariants } from "./store";
import { isPlaceholderImage } from "@shared/productImages";
import { checkImageUrl, probeImage } from "../lib/imageProxy";

export type JobName = "launches" | "prices" | "content" | "photos";
export const JOB_NAMES: JobName[] = ["launches", "prices", "content", "photos"];

export type Stats = Record<string, number>;

/** Stops work before the serverless time limit; each job checks it between units of work. */
export class Budget {
  private readonly deadline: number;
  constructor(ms: number) {
    this.deadline = Date.now() + ms;
  }
  get expired() {
    return Date.now() >= this.deadline;
  }
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = () => ({
  launchWindowDays: num(process.env.LAUNCH_WINDOW_DAYS, 45),
  maxPagesPerSource: num(process.env.LAUNCH_MAX_PAGES, 2),
  priceBatch: num(process.env.PRICE_BATCH_SIZE, 5),
  priceMaxAgeHours: num(process.env.PRICE_MAX_AGE_HOURS, 12),
  contentBatch: num(process.env.CONTENT_BATCH_SIZE, 4),
  contentMaxAgeHours: num(process.env.CONTENT_MAX_AGE_HOURS, 72),
  photoBatch: num(process.env.PHOTO_BATCH_SIZE, 30),
  photoMaxAgeHours: num(process.env.PHOTO_MAX_AGE_HOURS, 168),
});

function invalidateCaches(productIds: number[]) {
  for (const id of productIds) cache.invalidate(`product:${id}`);
  if (productIds.length > 0) cache.invalidatePattern("drops:");
}

// ---------------------------------------------------------------------------
// Launch detection: new products from brand-owned Shopify stores
// ---------------------------------------------------------------------------

async function applyBrandProduct(
  source: BrandSource,
  parsed: ParsedProduct,
  retailerId: number,
  now: Date,
  windowDays: number,
): Promise<"created" | "updated" | "skipped"> {
  const [existing] = await db.select().from(products).where(eq(products.sourceKey, parsed.sourceKey));

  if (!existing && !isRecentLaunch(parsed.launchedAt, now, windowDays)) return "skipped";

  let productId: number;
  if (existing) {
    productId = existing.id;
    await db
      .update(products)
      .set({
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        productUrl: parsed.productUrl,
        // The store's photo wins, except over one an operator set by hand.
        ...(parsed.imageUrl && existing.imageSource !== "manual" && parsed.imageUrl !== existing.imageUrl
          ? { imageUrl: parsed.imageUrl, imageSource: "store", imageOk: null, imageCheckedAt: null }
          : {}),
      })
      .where(eq(products.id, productId));
  } else {
    const [created] = await db
      .insert(products)
      .values({
        name: parsed.name,
        brand: source.name,
        category: parsed.category,
        country: source.country,
        description: parsed.description,
        imageUrl: parsed.imageUrl ?? "",
        imageSource: parsed.imageUrl ? "store" : null,
        sourceKey: parsed.sourceKey,
        brandSourceId: source.id,
        productUrl: parsed.productUrl,
        launchedAt: parsed.launchedAt,
        // lastPriceCheckAt stays empty so the seller-prices job compares new launches first.
      })
      .onConflictDoNothing({ target: products.sourceKey })
      .returning();
    if (!created) return "skipped"; // created concurrently by another run
    productId = created.id;
  }

  await upsertVariants(productId, parsed.variants);
  if (parsed.price != null) {
    await upsertOffer({
      productId,
      retailerId,
      price: parsed.price,
      currency: source.currency,
      url: parsed.productUrl,
      source: "brand_site",
      listPrice: parsed.listPrice,
      inStock: parsed.inStock,
    });
    await removeDemoOffers(productId);
  }
  return existing ? "updated" : "created";
}

export async function syncLaunches(budget: Budget, opts: { sourceId?: number } = {}): Promise<Stats> {
  const { launchWindowDays, maxPagesPerSource } = config();
  const stats: Stats = { sources: 0, created: 0, updated: 0, skipped: 0, failedSources: 0 };
  const now = new Date();

  const sources = await db
    .select()
    .from(brandSources)
    .where(opts.sourceId ? eq(brandSources.id, opts.sourceId) : eq(brandSources.active, true))
    .orderBy(sql`${brandSources.lastSyncedAt} asc nulls first`);

  for (const source of sources) {
    if (budget.expired) break;
    stats.sources++;
    try {
      const retailer = await findOrCreateRetailer({ name: source.name, country: source.country, domain: source.domain, kind: "brand" });
      for (let page = 1; page <= maxPagesPerSource && !budget.expired; page++) {
        const parsed = await fetchShopifyProductsPage(source.domain, page);
        for (const p of parsed) {
          const result = await applyBrandProduct(source, p, retailer.id, now, launchWindowDays);
          stats[result]++;
        }
        if (parsed.length < 250) break;
      }
      await db.update(brandSources).set({ lastSyncedAt: now, lastError: null }).where(eq(brandSources.id, source.id));
    } catch (err) {
      stats.failedSources++;
      const message = err instanceof Error ? err.message : String(err);
      await db.update(brandSources).set({ lastSyncedAt: now, lastError: message.slice(0, 500) }).where(eq(brandSources.id, source.id));
    }
  }
  if (stats.created + stats.updated > 0) cache.invalidatePattern("drops:");
  return stats;
}

// ---------------------------------------------------------------------------
// Multi-seller prices from Google Shopping (via SerpAPI)
// ---------------------------------------------------------------------------

async function productsDue(which: "price" | "content", maxAgeHours: number, limit: number, productId?: number): Promise<Product[]> {
  if (productId) return db.select().from(products).where(eq(products.id, productId));
  const column = which === "price" ? products.lastPriceCheckAt : products.lastContentCheckAt;
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);
  return db
    .select()
    .from(products)
    .where(or(isNull(column), lt(column, cutoff)))
    // Newest launches first among the due ones: they matter most to users.
    .orderBy(sql`${column} asc nulls first`, sql`${products.launchedAt} desc nulls last`)
    .limit(limit);
}

/** A product needs a photo if it has none, only a placeholder, or its photo failed the last check. */
export function needsPhoto(p: Pick<Product, "imageUrl" | "imageOk" | "imageSource">): boolean {
  if (p.imageSource === "manual" && p.imageOk !== false) return false;
  return isPlaceholderImage(p.imageUrl) || p.imageOk === false;
}

/** The brand's own listing photo if there is one, otherwise the cheapest seller's; proxy-servable hosts only. */
export function pickListingPhoto(sellers: { seller: string; thumbnail: string | null }[], brand: string): string | null {
  const usable = sellers.filter((s) => s.thumbnail && checkImageUrl(s.thumbnail).ok);
  const own = usable.find((s) => sameName(canonicalSellerName(s.seller), brand));
  return (own ?? usable[0])?.thumbnail ?? null;
}

export async function refreshProductOffers(product: Product): Promise<{ offers: number; photoAdded: number }> {
  const country = product.country === "IN" ? "IN" : "US";
  const results = await searchGoogleShopping(`${product.brand} ${product.name}`, country);
  const sellers = pickSellerOffers(results, product.brand, product.name);
  const currency = country === "IN" ? "INR" : "USD";

  for (const s of sellers) {
    const name = canonicalSellerName(s.seller);
    const retailer = await findOrCreateRetailer({
      name,
      country,
      kind: sameName(name, product.brand) ? "brand" : "retailer",
    });
    await upsertOffer({
      productId: product.id,
      retailerId: retailer.id,
      price: s.price,
      currency,
      url: s.url,
      source: "google_shopping",
      listPrice: s.listPrice,
      inStock: true, // Google Shopping only lists in-stock offers
    });
  }
  if (sellers.length > 0) await removeDemoOffers(product.id);

  // Fill in a photo for products that have none (or whose photo doesn't load),
  // using a listing already matched to this exact product.
  const photo = needsPhoto(product) ? pickListingPhoto(sellers, product.brand) : null;
  await db
    .update(products)
    .set({
      lastPriceCheckAt: new Date(),
      ...(photo ? { imageUrl: photo, imageSource: "google_shopping", imageOk: null, imageCheckedAt: null } : {}),
    })
    .where(eq(products.id, product.id));
  return { offers: sellers.length, photoAdded: photo ? 1 : 0 };
}

export async function refreshPrices(budget: Budget, opts: { productId?: number } = {}): Promise<Stats> {
  const stats: Stats = { products: 0, offers: 0, photosAdded: 0, failed: 0, skippedNotConfigured: 0 };
  if (!isGoogleShoppingConfigured()) {
    stats.skippedNotConfigured = 1;
    return stats;
  }
  const { priceBatch, priceMaxAgeHours } = config();
  const due = await productsDue("price", priceMaxAgeHours, priceBatch, opts.productId);
  const touched: number[] = [];
  for (const product of due) {
    if (budget.expired) break;
    stats.products++;
    try {
      const { offers, photoAdded } = await refreshProductOffers(product);
      stats.offers += offers;
      stats.photosAdded = (stats.photosAdded ?? 0) + photoAdded;
      touched.push(product.id);
    } catch (err) {
      stats.failed++;
      console.error(`Price refresh failed for product ${product.id}:`, err);
    }
  }
  invalidateCaches(touched);
  return stats;
}

// ---------------------------------------------------------------------------
// Creator videos from YouTube
// ---------------------------------------------------------------------------

export async function refreshProductVideos(product: Product): Promise<{ videos: number }> {
  const country = product.country === "IN" ? "IN" : "US";
  // Look back a little before launch to catch teaser/first-impression videos.
  const publishedAfter = product.launchedAt ? new Date(product.launchedAt.getTime() - 30 * 24 * 3600_000) : undefined;
  const items = await searchYouTube(`${product.brand} ${product.name} review`, country, publishedAfter);
  const videos = pickProductVideos(items, product.brand, product.name);

  await db.transaction(async (tx) => {
    // Replace platform-sourced videos and any legacy rows without a platform id.
    await tx
      .delete(productVideos)
      .where(and(eq(productVideos.productId, product.id), eq(productVideos.platform, "youtube")));
    if (videos.length > 0) {
      await tx.insert(productVideos).values(
        videos.map((v) => ({
          productId: product.id,
          platform: "youtube",
          externalId: v.videoId,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          videoUrl: v.videoUrl,
          embedUrl: v.embedUrl,
          creatorName: v.channelTitle,
          channelId: v.channelId,
          publishedAt: v.publishedAt,
        })),
      );
    }
    await tx
      .update(products)
      .set({ lastContentCheckAt: new Date(), influencerCount: videos.length, lastInfluencerRefresh: new Date() })
      .where(eq(products.id, product.id));
  });
  return { videos: videos.length };
}

export async function refreshContent(budget: Budget, opts: { productId?: number } = {}): Promise<Stats> {
  const stats: Stats = { products: 0, videos: 0, failed: 0, skippedNotConfigured: 0 };
  if (!isYouTubeConfigured()) {
    stats.skippedNotConfigured = 1;
    return stats;
  }
  const { contentBatch, contentMaxAgeHours } = config();
  const due = await productsDue("content", contentMaxAgeHours, contentBatch, opts.productId);
  const touched: number[] = [];
  for (const product of due) {
    if (budget.expired) break;
    stats.products++;
    try {
      const { videos } = await refreshProductVideos(product);
      stats.videos += videos;
      touched.push(product.id);
    } catch (err) {
      stats.failed++;
      console.error(`Content refresh failed for product ${product.id}:`, err);
    }
  }
  invalidateCaches(touched);
  return stats;
}

// ---------------------------------------------------------------------------
// Photo checks: does each product's real photo actually load?
// ---------------------------------------------------------------------------

export async function checkPhotos(budget: Budget, opts: { productId?: number } = {}): Promise<Stats> {
  const { photoBatch, photoMaxAgeHours } = config();
  const stats: Stats = { checked: 0, ok: 0, broken: 0 };
  const cutoff = new Date(Date.now() - photoMaxAgeHours * 3600_000);
  const due = opts.productId
    ? await db.select().from(products).where(eq(products.id, opts.productId))
    : await db
        .select()
        .from(products)
        .where(or(isNull(products.imageCheckedAt), lt(products.imageCheckedAt, cutoff)))
        .orderBy(sql`${products.imageCheckedAt} asc nulls first`, sql`${products.launchedAt} desc nulls last`)
        .limit(photoBatch);

  const isAllowed = await (async () => {
    const { brandImageHostCheck } = await import("../lib/imageHosts");
    const { isAllowedImageHost } = await import("../lib/imageProxyDomains");
    const brand = await brandImageHostCheck();
    return (host: string) => isAllowedImageHost(host) || brand(host);
  })();

  // Five at a time keeps each run quick without hammering any one CDN.
  for (let i = 0; i < due.length && !budget.expired; i += 5) {
    await Promise.all(
      due.slice(i, i + 5).map(async (p) => {
        const result = isPlaceholderImage(p.imageUrl) ? { ok: false } : await probeImage(p.imageUrl, isAllowed);
        stats.checked++;
        if (result.ok) stats.ok++;
        else stats.broken++;
        await db.update(products).set({ imageOk: result.ok, imageCheckedAt: new Date() }).where(eq(products.id, p.id));
      }),
    );
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Run bookkeeping
// ---------------------------------------------------------------------------

const RUNNERS: Record<JobName, (budget: Budget, opts: { productId?: number; sourceId?: number }) => Promise<Stats>> = {
  launches: syncLaunches,
  prices: refreshPrices,
  content: refreshContent,
  photos: checkPhotos,
};

/** Runs a job, recording it in ingestion_runs. Never throws; failures are recorded. */
export async function runJob(
  job: JobName,
  budgetMs: number,
  opts: { productId?: number; sourceId?: number } = {},
): Promise<IngestionRun> {
  const [run] = await db.insert(ingestionRuns).values({ job, status: "running" }).returning();
  let status: "success" | "partial" | "failed" = "success";
  let stats: Stats = {};
  let error: string | null = null;
  try {
    stats = await RUNNERS[job](new Budget(budgetMs), opts);
    if ((stats.failed ?? 0) > 0 || (stats.failedSources ?? 0) > 0) status = "partial";
  } catch (err) {
    status = "failed";
    error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    console.error(`Ingestion job ${job} failed:`, err);
  }
  const [finished] = await db
    .update(ingestionRuns)
    .set({ status, stats, error, finishedAt: new Date() })
    .where(eq(ingestionRuns.id, run.id))
    .returning();
  return finished;
}

export async function recentRuns(limit = 30): Promise<IngestionRun[]> {
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(limit);
}

export async function listBrandSources(): Promise<BrandSource[]> {
  return db.select().from(brandSources).orderBy(asc(brandSources.country), asc(brandSources.name));
}

