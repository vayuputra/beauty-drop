import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText, significantTokens, titleMatchesProduct } from "./text";
import { mapCategory } from "./category";
import { isRecentLaunch, parseShopifyProduct, parseShopifyProducts, type ShopifyProductJson } from "./shopify";
import { pickSellerOffers } from "./googleShopping";
import { pickProductVideos, type YouTubeSearchItem } from "./youtube";
import { normalizeDomain } from "./http";
import { summarizeOffers } from "../lib/offers";

describe("text helpers", () => {
  it("decodes entities and strips HTML", () => {
    expect(decodeEntities("Rock &amp; Roll &#39;n&#x27; &quot;glow&quot;")).toBe(`Rock & Roll 'n' "glow"`);
    expect(htmlToText("<p>Hydrating <b>lip</b> oil</p><script>alert(1)</script><ul><li>Vegan</li></ul>")).toBe("Hydrating lip oil Vegan");
  });

  it("truncates long descriptions on a word boundary", () => {
    const out = htmlToText("word ".repeat(300), 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
  });

  it("tokenizes without stopwords, sizes or accents", () => {
    expect(significantTokens("Sol de Janeiro Brazilian Bum Bum Crème 75 ml")).toEqual(["sol", "de", "janeiro", "brazilian", "bum", "creme"]);
  });

  it("matches listings that name the brand and product", () => {
    expect(titleMatchesProduct("Rare Beauty Soft Pinch Liquid Blush - Joy", "Rare Beauty", "Soft Pinch Liquid Blush")).toBe(true);
    expect(titleMatchesProduct("Soft Pinch Liquid Blush", "Rare Beauty", "Soft Pinch Liquid Blush")).toBe(false); // no brand
    expect(titleMatchesProduct("Rare Beauty Liquid Touch Foundation", "Rare Beauty", "Soft Pinch Liquid Blush")).toBe(false);
  });
});

describe("mapCategory", () => {
  it.each([
    ["Lip Oil", [], "Makeup"],
    ["Serum", [], "Skincare"],
    ["", ["hair"], "Hair"],
    ["Body Mist", [], "Fragrance"],
    ["Hand Cream", [], "Body"],
    ["", [], "Skincare"],
  ])("%s %j → %s", (type, tags, expected) => {
    expect(mapCategory(type, tags as string[])).toBe(expected);
  });

  it("falls back to the title", () => {
    expect(mapCategory(null, [], "Watermelon Glow Niacinamide Dew Drops")).toBe("Skincare");
    expect(mapCategory(null, [], "Kind Words Matte Lipstick")).toBe("Makeup");
  });
});

const shopifyProduct = (over: Partial<ShopifyProductJson> = {}): ShopifyProductJson => ({
  id: 101,
  title: "Soft Pinch Tinted Lip Oil",
  handle: "soft-pinch-tinted-lip-oil",
  body_html: "<p>A lightweight lip oil.</p>",
  product_type: "Lip",
  tags: ["new", "lips"],
  published_at: "2026-09-10T10:00:00-04:00",
  variants: [
    { id: 1, title: "Joy", price: "22.00", compare_at_price: null, available: false, position: 1 },
    { id: 2, title: "Hope", price: "20.00", compare_at_price: "24.00", available: true, position: 2 },
    { id: 3, title: "Serenity", price: "22.00", available: true, position: 3 },
  ],
  images: [{ src: "https://cdn.shopify.com/b.jpg", position: 2 }, { src: "https://cdn.shopify.com/a.jpg", position: 1 }],
  ...over,
});

describe("Shopify parsing", () => {
  it("normalizes a product with shades", () => {
    const p = parseShopifyProduct(shopifyProduct(), "www.rarebeauty.com")!;
    expect(p).toMatchObject({
      sourceKey: "shopify:www.rarebeauty.com:101",
      name: "Soft Pinch Tinted Lip Oil",
      productUrl: "https://www.rarebeauty.com/products/soft-pinch-tinted-lip-oil",
      description: "A lightweight lip oil.",
      category: "Makeup",
      imageUrl: "https://cdn.shopify.com/a.jpg",
      price: 20,
      listPrice: 24,
      inStock: true,
    });
    expect(p.launchedAt?.toISOString()).toBe("2026-09-10T14:00:00.000Z");
    expect(p.variants.map((v) => v.title)).toEqual(["Joy", "Hope", "Serenity"]);
  });

  it("uses the cheapest sold-out price when nothing is available", () => {
    const p = parseShopifyProduct(
      shopifyProduct({ variants: [{ id: 1, title: "Default Title", price: "30.00", available: false }] }),
      "x.com",
    )!;
    expect(p).toMatchObject({ price: 30, inStock: false });
    expect(p.variants[0].title).toBe("Soft Pinch Tinted Lip Oil");
  });

  it("skips gift cards, unpublished and priceless products", () => {
    expect(parseShopifyProduct(shopifyProduct({ title: "Digital Gift Card" }), "x.com")).toBeNull();
    expect(parseShopifyProduct(shopifyProduct({ product_type: "Shipping Protection" }), "x.com")).toBeNull();
    expect(parseShopifyProduct(shopifyProduct({ published_at: null }), "x.com")).toBeNull();
    expect(parseShopifyProduct(shopifyProduct({ variants: [{ id: 1, title: "x", price: "0.00" }] }), "x.com")).toBeNull();
  });

  it("rejects an unexpected feed shape", () => {
    expect(() => parseShopifyProducts({ nope: [] }, "x.com")).toThrow(/Unexpected/);
    expect(parseShopifyProducts({ products: [shopifyProduct(), { id: "bad" }] }, "x.com")).toHaveLength(1);
  });

  it("decides what counts as a new launch", () => {
    const now = new Date("2026-09-25T00:00:00Z");
    expect(isRecentLaunch(new Date("2026-09-01T00:00:00Z"), now, 45)).toBe(true);
    expect(isRecentLaunch(new Date("2026-06-01T00:00:00Z"), now, 45)).toBe(false);
    expect(isRecentLaunch(null, now, 45)).toBe(false);
  });
});

describe("pickSellerOffers", () => {
  const brand = "Glow Recipe";
  const name = "Watermelon Glow Niacinamide Dew Drops";
  const r = (source: string, title: string, price: number, extra: object = {}) => ({
    source, title, extracted_price: price, link: `https://${source.toLowerCase().replace(/\W/g, "")}.com/p`, ...extra,
  });

  it("keeps the cheapest matching listing per seller, sorted by price", () => {
    const offers = pickSellerOffers([
      r("Sephora", "Glow Recipe Watermelon Glow Niacinamide Dew Drops 40ml", 35),
      r("Sephora", "Glow Recipe Watermelon Glow Niacinamide Dew Drops Mini", 18),
      r("Ulta", "Glow Recipe Watermelon Glow Niacinamide Dew Drops", 34, { extracted_old_price: 40 }),
    ], brand, name);
    expect(offers.map((o) => [o.seller, o.price, o.listPrice])).toEqual([
      ["Sephora", 18, null],
      ["Ulta", 34, 40],
    ]);
  });

  it("drops dupes, other products, used items and insecure links", () => {
    const offers = pickSellerOffers([
      r("Amazon.com", "Watermelon Dew Drops Dupe inspired by Glow Recipe Niacinamide", 9),
      r("Target", "Glow Recipe Watermelon Pink Juice Moisturizer", 20),
      r("eBay", "Glow Recipe Watermelon Glow Niacinamide Dew Drops", 12, { second_hand_condition: "used" }),
      r("Shady", "Glow Recipe Watermelon Glow Niacinamide Dew Drops", 10, { link: "http://shady.example/p" }),
      { source: "NoPrice", title: "Glow Recipe Watermelon Glow Niacinamide Dew Drops", link: "https://x.com" },
    ], brand, name);
    expect(offers).toEqual([]);
  });
});

describe("pickProductVideos", () => {
  const item = (videoId: string, title: string, channelId: string, publishedAt: string): YouTubeSearchItem => ({
    id: { kind: "youtube#video", videoId },
    snippet: { title, channelId, channelTitle: `Chan ${channelId}`, publishedAt, description: "", thumbnails: { high: { url: `https://i.ytimg.com/vi/${videoId}/hq.jpg` } } },
  });

  it("keeps on-topic videos, one per channel, newest first", () => {
    const vids = pickProductVideos([
      item("aaaaaaaaaaa", "Rare Beauty Soft Pinch Lip Oil REVIEW &amp; swatches", "c1", "2026-09-12T00:00:00Z"),
      item("bbbbbbbbbbb", "Rare Beauty soft pinch lip oil — worth it?", "c2", "2026-09-20T00:00:00Z"),
      item("ccccccccccc", "Rare Beauty Soft Pinch Lip Oil again", "c1", "2026-09-21T00:00:00Z"),
      item("ddddddddddd", "My morning routine vlog", "c3", "2026-09-22T00:00:00Z"),
      item("bad id!", "Rare Beauty Soft Pinch Lip Oil", "c4", "2026-09-22T00:00:00Z"),
    ], "Rare Beauty", "Soft Pinch Tinted Lip Oil");
    expect(vids.map((v) => v.videoId)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    expect(vids[1].title).toBe("Rare Beauty Soft Pinch Lip Oil REVIEW & swatches");
    expect(vids[0].embedUrl).toBe("https://www.youtube-nocookie.com/embed/bbbbbbbbbbb");
  });
});

describe("normalizeDomain", () => {
  it.each([
    ["rarebeauty.com", "rarebeauty.com"],
    ["https://WWW.RareBeauty.com/", "www.rarebeauty.com"],
    ["in.sugarcosmetics.com", "in.sugarcosmetics.com"],
  ])("accepts %s", (input, out) => expect(normalizeDomain(input)).toBe(out));

  it.each(["localhost", "10.0.0.1", "169.254.169.254", "foo.internal", "rarebeauty.com:8443", "rarebeauty.com/products", "nodot", ""])(
    "rejects %s",
    (input) => expect(normalizeDomain(input)).toBeNull(),
  );
});

describe("summarizeOffers", () => {
  it("ignores sold-out offers for the starting price", () => {
    expect(summarizeOffers([
      { price: 10, currency: "USD", inStock: false },
      { price: 12, currency: "USD", inStock: true },
      { price: 15, currency: "USD", inStock: null },
    ])).toEqual({ minPrice: 12, maxPrice: 15, currency: "USD", soldOut: false });
  });

  it("flags products where everything is sold out", () => {
    expect(summarizeOffers([{ price: 10, currency: "USD", inStock: false }])).toMatchObject({ minPrice: 10, soldOut: true });
    expect(summarizeOffers([])).toMatchObject({ minPrice: null, soldOut: false });
  });
});
