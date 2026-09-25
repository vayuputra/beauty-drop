import { describe, expect, it } from "vitest";
import { isValidCronRequest } from "./cron";

describe("isValidCronRequest", () => {
  it("requires the exact bearer secret", () => {
    expect(isValidCronRequest("Bearer s3cret", "s3cret")).toBe(true);
    expect(isValidCronRequest("Bearer wrong!", "s3cret")).toBe(false);
    expect(isValidCronRequest("s3cret", "s3cret")).toBe(false);
    expect(isValidCronRequest(undefined, "s3cret")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(isValidCronRequest("Bearer ", undefined)).toBe(false);
    expect(isValidCronRequest("Bearer ", "")).toBe(false);
  });
});
