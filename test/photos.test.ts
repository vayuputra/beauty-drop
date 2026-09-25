/**
 * Product photos end-to-end against Postgres: brand-store photo hosts in the
 * proxy, Google Shopping thumbnails for products without photos, the photo
 * checker, and the admin "missing photos" tools. External hosts are stubbed.
 * Skipped without DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const hasDb = !!process.env.DATABASE_URL;
const run = Date.now().toString(36);
const domain = `photos-${run}.example.com`;
const adminEmail = `photos-admin-${run}@example.com`;
const password = "correct horse battery";
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
const TBN = `https://encrypted-tbn0.gstatic.com/shopping?q=tbn:${run}`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

process.env.ADMIN_EMAILS = adminEmail;
process.env.SERPAPI_KEY = "test-serp";

let storePhoto = `https://img.${domain}/tint.jpg`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const jpeg = () => new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } });

describe.skipIf(!hasDb)("product photos", () => {
  let app: Express;
  let admin: ReturnType<typeof request.agent>;
  let dbm: typeof import("../server/db");
  let schema: typeof import("../shared/schema");
  let orm: typeof import("drizzle-orm");
  let jobs: typeof import("../server/ingest/jobs");

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
      if (url.hostname === domain && url.pathname === "/products.json") {
        if (url.searchParams.get("page") !== "1") return json({ products: [] });
        return json({
          products: [{
            id: 1, title: "Photo Lip Tint", handle: "photo-lip-tint", product_type: "Lip", published_at: daysAgo(1),
            images: [{ src: storePhoto }], variants: [{ id: 11, title: "Default Title", price: "18.00", available: true }],
          }],
        });
      }
      if (url.hostname === `img.${domain}`) return url.pathname.includes("gone") ? new Response("", { status: 404 }) : jpeg();
      if (url.hostname === "encrypted-tbn0.gstatic.com") return jpeg();
      if (url.hostname === "not-watched.example.com") return jpeg();
      if (url.hostname === "serpapi.com") {
        const q = url.searchParams.get("q")!;
        return json({ shopping_results: [{ source: "Ulta", title: q, extracted_price: 30, link: "https://www.ulta.com/p", thumbnail: TBN }] });
      }
      return realFetch(input, init);
    });

    dbm = await import("../server/db");
    schema = await import("../shared/schema");
    orm = await import("drizzle-orm");
    jobs = await import("../server/ingest/jobs");
    ({ app } = await import("../server/app").then((m) => m.createApp()));
    admin = request.agent(app);
    await admin.post("/api/auth/register").send({ email: adminEmail, password, firstName: "Ada" }).expect(201);
    await admin.post("/api/admin/brand-sources").send({ name: `Photo ${run}`, domain, country: "US" }).expect(201);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await dbm?.pool.end();
  });

  const byKey = async () => (await dbm.db.select().from(schema.products).where(orm.eq(schema.products.sourceKey, `shopify:${domain}:1`)))[0];

  it("serves photos hosted on a watched brand store's own domain", async () => {
    await admin.post("/api/admin/jobs/launches").expect(200);
    const product = await byKey();
    expect(product).toMatchObject({ imageUrl: storePhoto, imageSource: "store" });

    const ok = await request(app).get(`/api/image-proxy?url=${encodeURIComponent(storePhoto)}`).expect(200);
    expect(ok.headers["content-type"]).toBe("image/jpeg");
    await request(app).get(`/api/image-proxy?url=${encodeURIComponent("https://not-watched.example.com/x.jpg")}`).expect(403);
  });

  it("checks that photos load and records the result", async () => {
    const product = await byKey();
    const [broken] = await dbm.db.insert(schema.products).values({
      name: `Broken Photo Balm ${run}`, brand: `Photo ${run}`, category: "Makeup", country: "US", description: "d",
      imageUrl: `https://img.${domain}/gone.jpg`, launchedAt: new Date(),
    }).returning();

    await jobs.runJob("photos", 10_000, { productId: product.id });
    await jobs.runJob("photos", 10_000, { productId: broken.id });
    expect((await byKey()).imageOk).toBe(true);
    const [after] = await dbm.db.select().from(schema.products).where(orm.eq(schema.products.id, broken.id));
    expect(after.imageOk).toBe(false);

    const list = await admin.get("/api/admin/photos").expect(200);
    const item = list.body.items.find((i: any) => i.id === broken.id);
    expect(item.problem).toBe("Photo doesn't load");
    expect(list.body.items.some((i: any) => i.id === product.id)).toBe(false);
  });

  it("fills a missing photo from a matched Google Shopping listing", async () => {
    const [missing] = await dbm.db.insert(schema.products).values({
      name: `Photoless Serum ${run}`, brand: "Glow Recipe", category: "Skincare", country: "US", description: "d", imageUrl: "",
    }).returning();

    const listed = await admin.get("/api/admin/photos").expect(200);
    expect(listed.body.items.find((i: any) => i.id === missing.id)?.problem).toBe("No photo");

    const res = await admin.post(`/api/admin/products/${missing.id}/find-photo`).expect(200);
    expect(res.body).toEqual({ found: true, imageUrl: TBN });
    const [after] = await dbm.db.select().from(schema.products).where(orm.eq(schema.products.id, missing.id));
    expect(after.imageSource).toBe("google_shopping");
  });

  it("lets an operator paste a photo, but only one that loads", async () => {
    const product = await byKey();
    const bad = await admin.patch(`/api/admin/products/${product.id}/image`).send({ imageUrl: `https://img.${domain}/gone.jpg` }).expect(422);
    expect(bad.body.error).toMatch(/can't be used/);
    await admin.patch(`/api/admin/products/${product.id}/image`).send({ imageUrl: "https://tracker.example/x.jpg" }).expect(422);
    await admin.patch(`/api/admin/products/${product.id}/image`).send({ imageUrl: TBN }).expect(200);
    expect(await byKey()).toMatchObject({ imageUrl: TBN, imageSource: "manual", imageOk: true });
  });

  it("keeps a hand-picked photo when the store catalog syncs again", async () => {
    storePhoto = `https://img.${domain}/tint-v2.jpg`;
    await admin.post("/api/admin/jobs/launches").expect(200);
    expect(await byKey()).toMatchObject({ imageUrl: TBN, imageSource: "manual" });
  });

  it("keeps photo tools admin-only", async () => {
    await request(app).get("/api/admin/photos").expect(401);
    const user = request.agent(app);
    await user.post("/api/auth/register").send({ email: `photos-user-${run}@example.com`, password, firstName: "U" }).expect(201);
    await user.get("/api/admin/photos").expect(403);
    await user.patch("/api/admin/products/1/image").send({ imageUrl: TBN }).expect(403);
  });
});
