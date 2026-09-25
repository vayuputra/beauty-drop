/**
 * End-to-end API tests against a real Postgres database.
 * Needs DATABASE_URL pointing at a disposable database with the schema pushed
 * (`npm run db:push`). Skipped when DATABASE_URL is not set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

const hasDb = !!process.env.DATABASE_URL;
const run = Date.now().toString(36);
const userEmail = `user-${run}@example.com`;
const adminEmail = `admin-${run}@example.com`;
const password = "correct horse battery";

process.env.ADMIN_EMAILS = adminEmail;
process.env.CRON_SECRET = "test-cron-secret";
delete process.env.PYTHON_FETCHER_URL;

describe.skipIf(!hasDb)("API", () => {
  let app: Express;
  let user: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let db: typeof import("../server/db");
  let schema: typeof import("../shared/schema");

  beforeAll(async () => {
    db = await import("../server/db");
    schema = await import("../shared/schema");
    const { seedDatabase } = await import("../server/seed");
    await seedDatabase();
    ({ app } = await import("../server/app").then((m) => m.createApp()));
    user = request.agent(app);
    admin = request.agent(app);
    await user.post("/api/auth/register").send({ email: userEmail, password, firstName: "Uma" }).expect(201);
    await admin.post("/api/auth/register").send({ email: adminEmail, password, firstName: "Ada" }).expect(201);
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  describe("auth", () => {
    it("is signed out without a session", async () => {
      await request(app).get("/api/user").expect(401);
    });

    it("returns the profile for an email/password session", async () => {
      const res = await user.get("/api/user").expect(200);
      expect(res.body).toMatchObject({ email: userEmail, firstName: "Uma", isAdmin: false });
    });

    it("signs in with the right password only", async () => {
      await request(app).post("/api/auth/login").send({ email: userEmail, password: "wrong password" }).expect(401);
      await request(app).post("/api/auth/login").send({ email: userEmail, password: "nope" }).expect(401);
      const fresh = request.agent(app);
      await fresh.post("/api/auth/login").send({ email: userEmail.toUpperCase(), password }).expect(200);
      await fresh.get("/api/user").expect(200);
    });

    it("rejects duplicate registrations", async () => {
      await request(app).post("/api/auth/register").send({ email: userEmail, password, firstName: "X" }).expect(409);
    });

    it("works for signed-in-only routes", async () => {
      await request(app).get("/api/favorites").expect(401);
      await user.get("/api/favorites").expect(200);
    });
  });

  describe("admin-only operations", () => {
    it("blocks signed-out and regular users", async () => {
      await request(app).get("/api/analytics/overview").expect(401);
      await user.get("/api/analytics/overview").expect(403);
      await user.post("/api/refresh-trending").expect(403);
      await user.post("/api/cache/invalidate").send({}).expect(403);
    });

    it("allows admins", async () => {
      const me = await admin.get("/api/user").expect(200);
      expect(me.body.isAdmin).toBe(true);
      await admin.get("/api/analytics/overview").expect(200);
      await admin.post("/api/cache/invalidate").send({}).expect(200);
    });
  });

  describe("request hardening", () => {
    it("blocks cross-site writes", async () => {
      await request(app)
        .post("/api/auth/login")
        .set("Origin", "https://evil.example")
        .send({ email: userEmail, password })
        .expect(403);
    });

    it("returns JSON 404 for unknown API routes", async () => {
      const res = await request(app).get("/api/nope").expect(404);
      expect(res.body).toEqual({ message: "Not found" });
    });

    it("validates input instead of crashing", async () => {
      await user.post("/api/notifications/mark-read").send({ ids: ["1; drop table users"] }).expect(400);
      await user.post("/api/notifications/mark-read").send({ ids: [1, 2] }).expect(200);
      await request(app).get("/api/image-proxy?url=http://example.com/x.png").expect(400);
      await request(app).get("/api/image-proxy?url=https://169.254.169.254/").expect(403);
    });

    it("favorites are idempotent", async () => {
      const [product] = await db.db.select().from(schema.products).limit(1);
      await user.post(`/api/products/${product.id}/favorite`).expect(201);
      await user.post(`/api/products/${product.id}/favorite`).expect(200);
      const ids = await user.get("/api/favorites/ids").expect(200);
      expect(ids.body.filter((id: number) => id === product.id)).toHaveLength(1);
    });
  });

  describe("prices", () => {
    it("says so when live prices are unavailable instead of faking success", async () => {
      const [product] = await db.db.select().from(schema.products).limit(1);
      const res = await user.post(`/api/products/${product.id}/refresh-prices`).expect(200);
      expect(res.body).toMatchObject({ success: false, updated: 0 });
    });

    it("the cron route requires the secret", async () => {
      await request(app).get("/api/cron/price-check").expect(401);
      await request(app).get("/api/cron/price-check").set("Authorization", "Bearer wrong").expect(401);
    });

    it("alerts once on a real price drop and never repeats", async () => {
      const { eq } = await import("drizzle-orm");
      const [product] = await db.db.select().from(schema.products).where(eq(schema.products.country, "US")).limit(1);
      const tracker = await user.post(`/api/products/${product.id}/price-tracker`).send({ notifyOnAnyDrop: true }).expect(201);
      expect(tracker.body.baselinePrice).toBeGreaterThan(0);

      const cron = () => request(app).get("/api/cron/price-check").set("Authorization", "Bearer test-cron-secret").expect(200);
      const unread = async () => (await user.get("/api/notifications/unread-count").expect(200)).body.count as number;
      await user.post("/api/notifications/mark-read").send({}).expect(200);

      await cron();
      expect(await unread()).toBe(0);

      const offers = await db.db.select().from(schema.productOffers).where(eq(schema.productOffers.productId, product.id));
      const cheapest = offers.reduce((a, b) => (a.price < b.price ? a : b));
      await db.db.update(schema.productOffers).set({ price: cheapest.price * 0.8 }).where(eq(schema.productOffers.id, cheapest.id));

      await cron();
      expect(await unread()).toBe(1);
      await cron();
      expect(await unread()).toBe(1);
    });
  });
});
