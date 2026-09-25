/**
 * Checkout agent end-to-end against Postgres: addresses (encrypted), jobs,
 * the audit trail and the hand-off redirect. Store responses are stubbed.
 * Skipped without DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const hasDb = !!process.env.DATABASE_URL;
const run = Date.now().toString(36);
const domain = `checkout-${run}.example.com`;
const password = "correct horse battery";
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

// Live price the store reports for the Peach shade (minor units, as Shopify's .js endpoint does).
let livePeachCents = 2000;
let peachAvailable = true;

const address = {
  fullName: "Priya Sharma",
  phone: "4155550123",
  line1: "500 Carter Street",
  line2: "",
  city: "San Francisco",
  state: "CA",
  postalCode: "94107",
  country: "US",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe.skipIf(!hasDb)("checkout agent", () => {
  let app: Express;
  let user: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let dbm: typeof import("../server/db");
  let schema: typeof import("../shared/schema");
  let orm: typeof import("drizzle-orm");
  let product: any;
  let brandOffer: any;
  let addressId: number;

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname === domain && url.pathname === "/products.json") {
        if (url.searchParams.get("page") !== "1") return json({ products: [] });
        return json({
          products: [{
            id: 77, title: "Glaze Lip Tint", handle: "glaze-lip-tint", product_type: "Lip", published_at: daysAgo(2),
            images: [{ src: "https://cdn.shopify.com/tint.jpg" }],
            variants: [
              { id: 7701, title: "Peach", price: "20.00", available: true, position: 1 },
              { id: 7702, title: "Berry", price: "20.00", available: true, position: 2 },
            ],
          }],
        });
      }
      if (url.hostname === domain && url.pathname === "/products/glaze-lip-tint.js") {
        return json({ variants: [{ id: 7701, price: livePeachCents, available: peachAvailable }, { id: 7702, price: 2000, available: true }] });
      }
      return realFetch(input, init);
    });

    dbm = await import("../server/db");
    schema = await import("../shared/schema");
    orm = await import("drizzle-orm");
    ({ app } = await import("../server/app").then((m) => m.createApp()));

    const [source] = await dbm.db.insert(schema.brandSources).values({ name: `Glaze ${run}`, domain, country: "US", currency: "USD" }).returning();
    const { runJob } = await import("../server/ingest/jobs");
    await runJob("launches", 10_000, { sourceId: source.id });
    [product] = await dbm.db.select().from(schema.products).where(orm.eq(schema.products.sourceKey, `shopify:${domain}:77`));

    user = request.agent(app);
    other = request.agent(app);
    await user.post("/api/auth/register").send({ email: `buyer-${run}@example.com`, password, firstName: "Priya" }).expect(201);
    await other.post("/api/auth/register").send({ email: `other-${run}@example.com`, password, firstName: "Olly" }).expect(201);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await dbm?.pool.end();
  });

  const variantId = async (title: string) =>
    (await dbm.db.select().from(schema.productVariants).where(orm.eq(schema.productVariants.productId, product.id))).find((v) => v.title === title)!.id;

  describe("addresses", () => {
    it("validates and stores addresses encrypted", async () => {
      const bad = await user.post("/api/addresses").send({ label: "Home", address: { ...address, postalCode: "9410" } }).expect(400);
      expect(bad.body.field).toBe("postalCode");

      const res = await user.post("/api/addresses").send({ label: "Home", address }).expect(201);
      addressId = res.body.id;
      expect(res.body).toMatchObject({ label: "Home", isDefault: true, summary: "San Francisco 94107" });

      const [row] = await dbm.db.select().from(schema.userAddresses).where(orm.eq(schema.userAddresses.id, addressId));
      expect(row.encrypted).not.toContain("Carter");
      expect(row.encrypted).not.toContain("Priya");

      const list = await user.get("/api/addresses").expect(200);
      expect(list.body[0].address.line1).toBe("500 Carter Street");
      expect((await other.get("/api/addresses").expect(200)).body).toEqual([]);
      await other.delete(`/api/addresses/${addressId}`).expect(404);
    });
  });

  describe("jobs", () => {
    it("marks which sellers the agent can prepare", async () => {
      const res = await request(app).get(`/api/products/${product.id}`).expect(200);
      brandOffer = res.body.offers.find((o: any) => o.source === "brand_site");
      expect(brandOffer.checkoutMode).toBe("cart_permalink");
    });

    it("asks for a shade when there are several", async () => {
      const res = await user.post("/api/checkout/jobs").send({ offerId: brandOffer.id }).expect(400);
      expect(res.body.error).toMatch(/shade/i);
    });

    it("prepares a pre-filled cart, logs every step and stops before payment", async () => {
      livePeachCents = 1800; // store dropped the price since we last synced
      const res = await user
        .post("/api/checkout/jobs")
        .send({ offerId: brandOffer.id, variantId: await variantId("Peach"), quantity: 2, addressId, shareAddress: true })
        .expect(201);
      const job = res.body;
      expect(job).toMatchObject({ status: "ready_for_payment", strategy: "cart_permalink", quotedPrice: 20, confirmedPrice: 18, quantity: 2 });
      expect(job.steps.map((s: any) => s.step)).toEqual([
        "Request received",
        "Checked price with the store",
        "Prepared cart",
        "Checkout details ready to pre-fill",
        "Stopped before payment",
      ]);
      expect(job.steps[1]).toMatchObject({ status: "warning" });
      // No personal data in the job or its audit trail.
      expect(JSON.stringify(job)).not.toMatch(/Carter|94107|4155550123/);

      const open = await user.get(`/api/checkout/jobs/${job.id}/open`).redirects(0).expect(302);
      const url = new URL(open.headers.location);
      expect(url.host).toBe(domain);
      expect(url.pathname).toBe("/cart/7701:2");
      expect(url.searchParams.get("checkout[shipping_address][address1]")).toBe("500 Carter Street");
      expect(url.searchParams.get("checkout[shipping_address][province]")).toBe("California");
      expect(url.searchParams.get("checkout[email]")).toBe(`buyer-${run}@example.com`);
      expect(open.headers["referrer-policy"]).toBe("no-referrer");

      const after = await user.get(`/api/checkout/jobs/${job.id}`).expect(200);
      expect(after.body.status).toBe("handed_off");
      expect(after.body.steps.at(-1).step).toBe("Opened seller checkout");
    });

    it("shares nothing personal without consent", async () => {
      livePeachCents = 2000;
      const res = await user.post("/api/checkout/jobs").send({ offerId: brandOffer.id, variantId: await variantId("Berry") }).expect(201);
      expect(res.body.steps[1]).toMatchObject({ step: "Checked price and stock with the store", status: "ok" });
      const open = await user.get(`/api/checkout/jobs/${res.body.id}/open`).redirects(0).expect(302);
      expect(open.headers.location).toMatch(/\/cart\/7702:1\?/);
      expect(open.headers.location).not.toMatch(/checkout%5B/);
    });

    it("fails clearly when the shade has sold out", async () => {
      peachAvailable = false;
      try {
        const res = await user.post("/api/checkout/jobs").send({ offerId: brandOffer.id, variantId: await variantId("Peach") }).expect(201);
        expect(res.body.status).toBe("failed");
        expect(res.body.steps.at(-1)).toMatchObject({ status: "failed" });
        await user.get(`/api/checkout/jobs/${res.body.id}/open`).redirects(0).expect(409);
      } finally {
        peachAvailable = true;
      }
    });

    it("keeps jobs private and cancellable", async () => {
      const res = await user.post("/api/checkout/jobs").send({ offerId: brandOffer.id, variantId: await variantId("Berry") }).expect(201);
      await other.get(`/api/checkout/jobs/${res.body.id}`).expect(404);
      await other.get(`/api/checkout/jobs/${res.body.id}/open`).redirects(0).expect(404);
      await other.post(`/api/checkout/jobs/${res.body.id}/cancel`).expect(404);
      await request(app).post("/api/checkout/jobs").send({ offerId: brandOffer.id }).expect(401);

      const cancelled = await user.post(`/api/checkout/jobs/${res.body.id}/cancel`).expect(200);
      expect(cancelled.body.status).toBe("cancelled");
      await user.get(`/api/checkout/jobs/${res.body.id}/open`).redirects(0).expect(409);

      const list = await user.get("/api/checkout/jobs").expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(4);
      expect(list.body[0].product).toMatchObject({ id: product.id, name: "Glaze Lip Tint" });
    });

    it("uses Amazon's add-to-cart link, never automation", async () => {
      const { findOrCreateRetailer } = await import("../server/ingest/store");
      const amazon = await findOrCreateRetailer({ name: "Amazon", country: "US" });
      const [offer] = await dbm.db.insert(schema.productOffers).values({
        productId: product.id, retailerId: amazon.id, price: 21, currency: "USD", source: "google_shopping",
        affiliateUrl: "https://www.amazon.com/Glaze-Lip-Tint/dp/B0TESTASIN?th=1",
      }).onConflictDoUpdate({ target: [schema.productOffers.productId, schema.productOffers.retailerId], set: { affiliateUrl: "https://www.amazon.com/Glaze-Lip-Tint/dp/B0TESTASIN?th=1" } }).returning();

      const res = await user.post("/api/checkout/jobs").send({ offerId: offer.id }).expect(201);
      expect(res.body).toMatchObject({ strategy: "amazon_cart", status: "ready_for_payment" });
      const open = await user.get(`/api/checkout/jobs/${res.body.id}/open`).redirects(0).expect(302);
      const url = new URL(open.headers.location);
      expect(url.host).toBe("www.amazon.com");
      expect(url.pathname).toBe("/gp/aws/cart/add.html");
      expect(url.searchParams.get("ASIN.1")).toBe("B0TESTASIN");
    });

    it("forgets the address link when the address is deleted", async () => {
      await user.delete(`/api/addresses/${addressId}`).expect(200);
      const jobs = await dbm.db.select().from(schema.checkoutJobs).where(orm.eq(schema.checkoutJobs.addressId, addressId));
      expect(jobs).toEqual([]);
    });
  });
});
