import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
const { buildFeed, computePriceDrops, interestCategories } = await import("./feed");

const NOW = new Date("2026-09-25T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86400_000);

let nextId = 1;
const product = (over: Record<string, unknown> = {}) =>
  ({
    id: nextId++,
    name: "P",
    brand: "B",
    category: "Skincare",
    country: "US",
    imageUrl: "https://cdn.shopify.com/x.jpg",
    launchedAt: null,
    minPrice: 10,
    maxPrice: 10,
    currency: "USD",
    soldOut: false,
    ...over,
  }) as any;

describe("computePriceDrops", () => {
  it("reports the latest drop per product, biggest first", () => {
    const drops = computePriceDrops([
      { productId: 1, retailerId: 1, price: 40 },
      { productId: 1, retailerId: 1, price: 30 }, // -25%
      { productId: 1, retailerId: 2, price: 40 },
      { productId: 1, retailerId: 2, price: 38 }, // -5%
      { productId: 2, retailerId: 1, price: 20 },
      { productId: 2, retailerId: 1, price: 20 }, // unchanged (same price twice)
      { productId: 2, retailerId: 1, price: 18 }, // -10%
    ]);
    expect(drops).toEqual([
      { productId: 1, previousPrice: 40, currentPrice: 30, dropPercent: 25 },
      { productId: 2, previousPrice: 20, currentPrice: 18, dropPercent: 10 },
    ]);
  });

  it("ignores rises, rebounds and tiny changes", () => {
    expect(computePriceDrops([
      { productId: 1, retailerId: 1, price: 10 },
      { productId: 1, retailerId: 1, price: 12 },
      { productId: 2, retailerId: 1, price: 20 },
      { productId: 2, retailerId: 1, price: 15 },
      { productId: 2, retailerId: 1, price: 21 }, // back up: latest move is a rise
      { productId: 3, retailerId: 1, price: 100 },
      { productId: 3, retailerId: 1, price: 98 },
    ])).toEqual([]);
  });
});

describe("interestCategories", () => {
  it("maps onboarding interests onto catalog categories", () => {
    expect(interestCategories(["Skincare", "Haircare", "Tools", "Wellness", "Makeup"])).toEqual(["Skincare", "Hair", "Body", "Makeup"]);
    expect(interestCategories(null)).toEqual([]);
  });
});

describe("buildFeed", () => {
  it("fills every section without repeating a product", () => {
    const hero = product({ launchedAt: daysAgo(1) });
    const soldOutNew = product({ launchedAt: daysAgo(0), soldOut: true });
    const recent = product({ launchedAt: daysAgo(10) });
    const old = product({ launchedAt: daysAgo(200), category: "Makeup" });
    const dropped = product({ category: "Skincare" });
    const plain = product({ category: "Makeup" });
    const products = [soldOutNew, hero, recent, old, dropped, plain];

    const feed = buildFeed({
      products,
      videosByProduct: new Map([[recent.id, [{ id: 1, title: "t", creatorName: "c", thumbnailUrl: null, videoUrl: "u", embedUrl: null, publishedAt: null }]]]),
      drops: [{ productId: dropped.id, previousPrice: 20, currentPrice: 15, dropPercent: 25 }],
      interests: ["Makeup"],
      now: NOW,
    });

    expect(feed.hero?.id).toBe(hero.id); // newest *buyable* launch
    expect(feed.stories.map((s) => s.product.id)).toEqual([recent.id]);
    expect(feed.justLaunched.map((p) => p.id)).toEqual([soldOutNew.id, recent.id]);
    expect(feed.priceDrops.map((d) => d.product.id)).toEqual([dropped.id]);
    expect(feed.forYou.map((p) => p.id)).toEqual([old.id, plain.id]); // Makeup first, then the rest
    expect(feed.total).toBe(6);

    const aboveForYou = [feed.hero!.id, ...feed.justLaunched.map((p) => p.id), ...feed.priceDrops.map((d) => d.productId)];
    expect(new Set(aboveForYou).size).toBe(aboveForYou.length);
  });

  it("handles an empty catalog", () => {
    expect(buildFeed({ products: [], videosByProduct: new Map(), drops: [], interests: [] })).toMatchObject({
      hero: null, stories: [], justLaunched: [], priceDrops: [], forYou: [], total: 0,
    });
  });
});
