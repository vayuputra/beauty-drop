import { and, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { priceHistory, productVideos, type ProductVideo, type ProductWithPriceRange } from "@shared/schema";

const DAY_MS = 24 * 3600_000;

export interface PriceDrop {
  productId: number;
  previousPrice: number;
  currentPrice: number;
  dropPercent: number;
}

export interface StoryVideo {
  id: number;
  title: string | null;
  creatorName: string | null;
  thumbnailUrl: string | null;
  videoUrl: string;
  embedUrl: string | null;
  publishedAt: Date | null;
}

export interface FeedStory {
  product: ProductWithPriceRange;
  videos: StoryVideo[];
}

export interface Feed {
  hero: ProductWithPriceRange | null;
  stories: FeedStory[];
  justLaunched: ProductWithPriceRange[];
  priceDrops: (PriceDrop & { product: ProductWithPriceRange })[];
  forYou: ProductWithPriceRange[];
  total: number;
}

// Onboarding interest names → catalog categories.
const INTEREST_TO_CATEGORY: Record<string, string> = {
  skincare: "Skincare",
  makeup: "Makeup",
  haircare: "Hair",
  hair: "Hair",
  fragrance: "Fragrance",
  body: "Body",
  wellness: "Body",
  nails: "Nails",
};

export function interestCategories(interests: string[] | null | undefined): string[] {
  return Array.from(new Set((interests ?? []).map((i) => INTEREST_TO_CATEGORY[i.toLowerCase()]).filter(Boolean)));
}

/**
 * For each product, the biggest recent drop at any single seller: the latest
 * observed price versus the price observed before it. History rows must be
 * sorted oldest → newest.
 */
export function computePriceDrops(
  history: { productId: number; retailerId: number; price: number }[],
  minDropPercent = 5,
): PriceDrop[] {
  const lastTwo = new Map<string, number[]>();
  for (const h of history) {
    const key = `${h.productId}:${h.retailerId}`;
    const prices = lastTwo.get(key) ?? [];
    if (prices[prices.length - 1] !== h.price) prices.push(h.price);
    lastTwo.set(key, prices.slice(-2));
  }
  const best = new Map<number, PriceDrop>();
  lastTwo.forEach((prices, key) => {
    if (prices.length < 2) return;
    const [previousPrice, currentPrice] = prices;
    if (!(currentPrice < previousPrice)) return;
    const dropPercent = Math.round(((previousPrice - currentPrice) / previousPrice) * 100);
    if (dropPercent < minDropPercent) return;
    const productId = Number(key.split(":")[0]);
    const existing = best.get(productId);
    if (!existing || dropPercent > existing.dropPercent) best.set(productId, { productId, previousPrice, currentPrice, dropPercent });
  });
  return Array.from(best.values()).sort((a, b) => b.dropPercent - a.dropPercent);
}

const isRecent = (d: Date | string | null | undefined, days: number, now: number) =>
  !!d && now - new Date(d).getTime() <= days * DAY_MS && now - new Date(d).getTime() >= -DAY_MS;

/**
 * Arranges a country's products into the Today feed. Products arrive sorted
 * newest launch first. Each product appears at most once above "For you".
 */
export function buildFeed(input: {
  products: ProductWithPriceRange[];
  videosByProduct: Map<number, StoryVideo[]>;
  drops: PriceDrop[];
  interests: string[];
  now?: number;
}): Feed {
  const now = input.now ?? Date.now();
  const buyable = input.products.filter((p) => !p.soldOut && p.minPrice != null);
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const used = new Set<number>();

  const hero =
    buyable.find((p) => isRecent(p.launchedAt, 30, now) && p.imageUrl) ??
    buyable[0] ??
    input.products[0] ??
    null;
  if (hero) used.add(hero.id);

  const stories: FeedStory[] = [];
  for (const p of input.products) {
    const videos = input.videosByProduct.get(p.id);
    if (videos && videos.length > 0) stories.push({ product: p, videos: videos.slice(0, 5) });
    if (stories.length >= 12) break;
  }

  const justLaunched = input.products
    .filter((p) => !used.has(p.id) && isRecent(p.launchedAt, 30, now))
    .slice(0, 12);
  justLaunched.forEach((p) => used.add(p.id));

  const priceDrops = input.drops
    .filter((d) => byId.has(d.productId) && !used.has(d.productId))
    .slice(0, 10)
    .map((d) => ({ ...d, product: byId.get(d.productId)! }));
  priceDrops.forEach((d) => used.add(d.productId));

  // Everything else, favourite categories first (stable within each group).
  const preferred = new Set(input.interests);
  const rest = input.products.filter((p) => !used.has(p.id));
  const forYou = preferred.size > 0
    ? [...rest.filter((p) => preferred.has(p.category)), ...rest.filter((p) => !preferred.has(p.category))]
    : rest;

  return { hero, stories, justLaunched, priceDrops, forYou, total: input.products.length };
}

/** Loads the videos and recent price history the feed needs, in two queries. */
export async function loadFeedSignals(productIds: number[]): Promise<{
  videosByProduct: Map<number, StoryVideo[]>;
  drops: PriceDrop[];
}> {
  if (productIds.length === 0) return { videosByProduct: new Map(), drops: [] };

  const videos: ProductVideo[] = await db
    .select()
    .from(productVideos)
    .where(and(inArray(productVideos.productId, productIds), isNotNull(productVideos.externalId)))
    .orderBy(sql`${productVideos.publishedAt} desc nulls last`);
  const videosByProduct = new Map<number, StoryVideo[]>();
  for (const v of videos) {
    const list = videosByProduct.get(v.productId) ?? [];
    list.push({
      id: v.id,
      title: v.title,
      creatorName: v.creatorName,
      thumbnailUrl: v.thumbnailUrl,
      videoUrl: v.videoUrl,
      embedUrl: v.embedUrl,
      publishedAt: v.publishedAt,
    });
    videosByProduct.set(v.productId, list);
  }

  const history = await db
    .select({ productId: priceHistory.productId, retailerId: priceHistory.retailerId, price: priceHistory.price })
    .from(priceHistory)
    .where(and(inArray(priceHistory.productId, productIds), gte(priceHistory.observedAt, new Date(Date.now() - 30 * DAY_MS))))
    .orderBy(priceHistory.observedAt, priceHistory.id);

  return { videosByProduct, drops: computePriceDrops(history) };
}

