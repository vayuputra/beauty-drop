/**
 * Ingestion jobs end-to-end against Postgres, with brand stores, SerpAPI and
 * YouTube replaced by recorded-shape responses. Skipped without DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const hasDb = !!process.env.DATABASE_URL;
const run = Date.now().toString(36);
const domain = `store-${run}.example.com`;
const brokenDomain = `broken-${run}.example.com`;
const adminEmail = `ingest-admin-${run}@example.com`;
const password = "correct horse battery";

process.env.ADMIN_EMAILS = adminEmail;
process.env.CRON_SECRET = "test-cron-secret";
process.env.SERPAPI_KEY = "test-serp";
process.env.YOUTUBE_API_KEY = "test-yt";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
let lipOilPrice = "20.00";

function storeFeed() {
  return {
    products: [
      {
        id: 9001, title: "Cloud Glaze Lip Oil", handle: "cloud-glaze-lip-oil", product_type: "Lip",
        body_html: "<p>Glassy shine.</p>", published_at: daysAgo(3), tags: [],
        images: [{ src: "https://cdn.shopify.com/lip.jpg", position: 1 }],
        variants: [
          { id: 1, title: "Peach", price: lipOilPrice, available: true, position: 1 },
          { id: 2, title: "Berry", price: "20.00", available: false, position: 2 },
        ],
      },
      {
        id: 9002, title: "Old Faithful Cleanser", handle: "old-faithful", product_type: "Cleanser",
        published_at: daysAgo(400), variants: [{ id: 3, title: "Default Title", price: "18.00", available: true }],
      },
      { id: 9003, title: "E-Gift Card", handle: "gift", published_at: daysAgo(1), variants: [{ id: 4, title: "$50", price: "50.00", available: true }] },
    ],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe.skipIf(!hasDb)("ingestion", () => {
  let app: Express;
  let admin: ReturnType<typeof request.agent>;
  let dbm: typeof import("../server/db");
  let schema: typeof import("../shared/schema");
  let orm: typeof import("drizzle-orm");
  let jobs: typeof import("../server/ingest/jobs");
  let lastQueries: string[] = [];

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname === domain && url.pathname === "/products.json") {
        return url.searchParams.get("page") === "1" ? json(storeFeed()) : json({ products: [] });
      }
      if (url.hostname === brokenDomain) return new Response("Not found", { status: 404 });
      if (url.hostname === "serpapi.com") {
        const q = url.searchParams.get("q")!;
        lastQueries.push(q);
        return json({
          shopping_results: [
            { source: "Sephora.com", title: `${q} 5ml`, extracted_price: 21, link: "https://www.sephora.com/p/1" },
            { source: "Ulta", title: q, extracted_price: 19.5, extracted_old_price: 22, link: "https://www.ulta.com/p/1" },
            { source: "Amazon.com", title: `Dupe inspired by ${q}`, extracted_price: 6, link: "https://www.amazon.com/p/1" },
          ],
        });
      }
      if (url.hostname === "www.googleapis.com") {
        const q = url.searchParams.get("q")!.replace(/ review$/, "");
        return json({
          items: [
            { id: { videoId: "vid00000001" }, snippet: { title: `${q} review`, channelId: "ch1", channelTitle: "Glow Lab", publishedAt: daysAgo(2), thumbnails: { high: { url: "https://i.ytimg.com/vi/vid00000001/hq.jpg" } } } },
            { id: { videoId: "vid00000002" }, snippet: { title: "Unrelated haul", channelId: "ch2", channelTitle: "Other", publishedAt: daysAgo(1) } },
          ],
        });
      }
      return realFetch(input, init);
    });

    dbm = await import("../server/db");
    schema = await import("../shared/schema");
    orm = await import("drizzle-orm");
    jobs = await import("../server/ingest/jobs");
    const { seedDatabase } = await import("../server/seed");
    await seedDatabase();
    ({ app } = await import("../server/app").then((m) => m.createApp()));
    admin = request.agent(app);
    await admin.post("/api/auth/register").send({ email: adminEmail, password, firstName: "Ada" }).expect(201);
    await admin.post("/api/admin/brand-sources").send({ name: `Cloud ${run}`, domain, country: "US" }).expect(201);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await dbm?.pool.end();
  });

  const productByKey = async (key: string) => {
    const [p] = await dbm.db.select().from(schema.products).where(orm.eq(schema.products.sourceKey, key));
    return p;
  };

  it("imports only recent launches from a brand store", async () => {
    const res = await admin.post("/api/admin/jobs/launches").expect(200);
    expect(res.body.status).toMatch(/success|partial/);

    const lip = await productByKey(`shopify:${domain}:9001`);
    expect(lip).toMatchObject({ name: "Cloud Glaze Lip Oil", brand: `Cloud ${run}`, category: "Makeup", country: "US", description: "Glassy shine." });
    expect(lip.productUrl).toBe(`https://${domain}/products/cloud-glaze-lip-oil`);
    expect(await productByKey(`shopify:${domain}:9002`)).toBeUndefined(); // launched 400 days ago
    expect(await productByKey(`shopify:${domain}:9003`)).toBeUndefined(); // gift card

    const detail = await request(app).get(`/api/products/${lip.id}`).expect(200);
    expect(detail.body.variants.map((v: any) => [v.title, v.available])).toEqual([["Peach", true], ["Berry", false]]);
    expect(detail.body.offers).toHaveLength(1);
    expect(detail.body.offers[0]).toMatchObject({ price: 20, source: "brand_site", inStock: true, affiliateUrl: lip.productUrl });
    expect(detail.body.offers[0].retailer).toMatchObject({ kind: "brand", domain });
  });

  it("updates prices on re-sync without duplicating products", async () => {
    lipOilPrice = "18.00";
    const source = (await dbm.db.select().from(schema.brandSources).where(orm.eq(schema.brandSources.domain, domain)))[0];
    await jobs.runJob("launches", 10_000, { sourceId: source.id });

    const rows = await dbm.db.select().from(schema.products).where(orm.eq(schema.products.sourceKey, `shopify:${domain}:9001`));
    expect(rows).toHaveLength(1);
    const history = await dbm.db.select().from(schema.priceHistory).where(orm.eq(schema.priceHistory.productId, rows[0].id));
    expect(history.map((h) => h.price)).toEqual([20, 18]);
    expect(history.every((h) => h.source === "brand_site")).toBe(true);
  });

  it("compares the newest launch against other sellers first", async () => {
    process.env.PRICE_BATCH_SIZE = "1";
    try {
      const runRes = await jobs.runJob("prices", 10_000);
      expect(runRes.stats).toMatchObject({ products: 1 });
    } finally {
      delete process.env.PRICE_BATCH_SIZE;
    }
    const lip = await productByKey(`shopify:${domain}:9001`);
    expect(lip.lastPriceCheckAt).not.toBeNull();
    const offers = await dbm.db.select().from(schema.productOffers).where(orm.eq(schema.productOffers.productId, lip.id));
    expect(offers.map((o) => o.source).sort()).toEqual(["brand_site", "google_shopping", "google_shopping"]);
  });

  it("records a failing store instead of aborting the run", async () => {
    await admin.post("/api/admin/brand-sources").send({ name: "Broken", domain: brokenDomain, country: "US" }).expect(201);
    const res = await admin.post("/api/admin/jobs/launches").expect(200);
    expect(res.body.status).toBe("partial");
    const [broken] = await dbm.db.select().from(schema.brandSources).where(orm.eq(schema.brandSources.domain, brokenDomain));
    expect(broken.lastError).toMatch(/404/);
  });

  it("adds other sellers from Google Shopping and drops placeholder prices", async () => {
    // A fresh product with placeholder offers, so the test doesn't depend on earlier runs.
    const [demo] = await dbm.db.insert(schema.products).values({
      name: `Velvet Test Blush ${run}`, brand: "Rare Beauty", category: "Makeup", country: "US", description: "d", imageUrl: "",
    }).returning();
    const us = await dbm.db.select().from(schema.retailers).where(orm.eq(schema.retailers.country, "US"));
    const byName = (n: string) => us.find((r) => r.name === n)!;
    await dbm.db.insert(schema.productOffers).values([
      { productId: demo.id, retailerId: byName("Sephora").id, price: 30, currency: "USD", affiliateUrl: "https://www.sephora.com/search", source: "demo" },
      { productId: demo.id, retailerId: byName("Amazon").id, price: 27, currency: "USD", affiliateUrl: "https://www.amazon.com/s", source: "demo" },
    ]);

    const runRes = await jobs.runJob("prices", 10_000, { productId: demo.id });
    expect(runRes.stats).toMatchObject({ products: 1, offers: 2 });

    const detail = await request(app).get(`/api/products/${demo.id}`).expect(200);
    const offers = detail.body.offers.map((o: any) => [o.retailer.name, o.price, o.source, o.listPrice]);
    expect(offers.sort()).toEqual([
      ["Sephora", 21, "google_shopping", null],
      ["Ulta Beauty", 19.5, "google_shopping", 22],
    ]);
  });

  it("stores real creator videos", async () => {
    const lip = await productByKey(`shopify:${domain}:9001`);
    const runRes = await jobs.runJob("content", 10_000, { productId: lip.id });
    expect(runRes.stats).toMatchObject({ products: 1, videos: 1 });
    const detail = await request(app).get(`/api/products/${lip.id}`).expect(200);
    expect(detail.body.videos).toHaveLength(1);
    expect(detail.body.videos[0]).toMatchObject({ externalId: "vid00000001", creatorName: "Glow Lab", platform: "youtube" });
  });

  it("puts new launches first in the feed", async () => {
    const res = await request(app).get("/api/drops?country=US").expect(200);
    expect(res.body[0].sourceKey).toMatch(/^shopify:/);
  });

  it("restricts ingestion controls to admins and validates domains", async () => {
    await request(app).get("/api/admin/ingestion-runs").expect(401);
    await admin.post("/api/admin/brand-sources").send({ name: "Evil", domain: "169.254.169.254", country: "US" }).expect(400);
    await admin.post("/api/admin/brand-sources").send({ name: "Dup", domain, country: "US" }).expect(409);
    const runs = await admin.get("/api/admin/ingestion-runs").expect(200);
    expect(runs.body.runs.length).toBeGreaterThan(0);
    expect(runs.body.configured).toEqual({ launches: true, prices: true, content: true });
  });

  it("cron ingestion requires the secret", async () => {
    await request(app).get("/api/cron/ingest/launches").expect(401);
    await request(app).get("/api/cron/ingest/launches").set("Authorization", "Bearer test-cron-secret").expect(200);
    await request(app).get("/api/cron/ingest/nope").set("Authorization", "Bearer test-cron-secret").expect(404);
  });
});
