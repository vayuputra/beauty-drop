import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { catchAsyncErrors, isAllowedOrigin, sameOriginWrites, wrapAsync } from "./http";

describe("wrapAsync", () => {
  it("forwards rejected promises to next()", async () => {
    const err = new Error("boom");
    const next = vi.fn();
    wrapAsync(async () => {
      throw err;
    })({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe("catchAsyncErrors", () => {
  it("turns async handler failures into error responses instead of crashing", async () => {
    const app = express();
    catchAsyncErrors(app);
    app.get("/fail", async () => {
      throw Object.assign(new Error("nope"), { status: 418 });
    });
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status).json({ message: err.message }));
    const res = await request(app).get("/fail");
    expect(res.status).toBe(418);
    expect(res.body.message).toBe("nope");
  });

  it("leaves app.get(setting) lookups working", () => {
    const app = express();
    catchAsyncErrors(app);
    app.set("answer", 42);
    expect(app.get("answer")).toBe(42);
  });
});

describe("isAllowedOrigin", () => {
  it("matches the request host", () => {
    expect(isAllowedOrigin("https://beautydrop.app", "beautydrop.app", [])).toBe(true);
    expect(isAllowedOrigin("https://evil.example", "beautydrop.app", [])).toBe(false);
  });

  it("accepts explicitly allowed origins", () => {
    expect(isAllowedOrigin("capacitor://localhost", "beautydrop.app", ["capacitor://localhost"])).toBe(true);
  });

  it("rejects malformed origins", () => {
    expect(isAllowedOrigin("null", "beautydrop.app", [])).toBe(false);
  });
});

describe("sameOriginWrites", () => {
  const app = express();
  app.use(sameOriginWrites([]));
  app.all("/x", (_req, res) => res.json({ ok: true }));

  it("allows reads from anywhere", async () => {
    expect((await request(app).get("/x").set("Origin", "https://evil.example")).status).toBe(200);
  });

  it("blocks cross-site writes", async () => {
    expect((await request(app).post("/x").set("Origin", "https://evil.example")).status).toBe(403);
  });

  it("allows same-site writes and non-browser clients", async () => {
    expect((await request(app).post("/x").set("Host", "beautydrop.app").set("Origin", "https://beautydrop.app")).status).toBe(200);
    expect((await request(app).post("/x")).status).toBe(200);
  });
});
