import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ authStorage: { getUser: vi.fn() } }));

const { getUserId, isAdminEmail, parseAdminEmails } = await import("./identity");

const req = (user: unknown, authenticated = true) => ({ user, isAuthenticated: () => authenticated }) as any;

describe("getUserId", () => {
  it("reads the unified session shape", () => {
    expect(getUserId(req({ id: "u1" }))).toBe("u1");
  });

  it("still reads legacy OIDC-claims sessions", () => {
    expect(getUserId(req({ claims: { sub: "g-123" } }))).toBe("g-123");
  });

  it("returns undefined when signed out", () => {
    expect(getUserId(req({ id: "u1" }, false))).toBeUndefined();
    expect(getUserId(req(undefined))).toBeUndefined();
    expect(getUserId(req({ id: "" }))).toBeUndefined();
  });
});

describe("admin emails", () => {
  it("parses and matches case-insensitively", () => {
    const admins = parseAdminEmails(" Ops@Example.com, second@example.com ,");
    expect([...admins]).toEqual(["ops@example.com", "second@example.com"]);
    expect(isAdminEmail("OPS@example.com", admins)).toBe(true);
    expect(isAdminEmail("someone@example.com", admins)).toBe(false);
    expect(isAdminEmail(null, admins)).toBe(false);
  });
});
