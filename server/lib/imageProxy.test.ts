import { describe, expect, it } from "vitest";
import { checkImageUrl, normalizeContentType } from "./imageProxy";

describe("checkImageUrl", () => {
  it("accepts https URLs on the allowlist", () => {
    const r = checkImageUrl("https://images-static.nykaa.com/media/x.jpg");
    expect(r.ok).toBe(true);
  });

  it.each([
    [undefined, 400],
    ["", 400],
    ["not a url", 400],
    ["http://images-static.nykaa.com/x.jpg", 400],
    ["https://user:pass@images-static.nykaa.com/x.jpg", 400],
    ["https://images-static.nykaa.com:8443/x.jpg", 400],
    ["https://169.254.169.254/latest/meta-data", 403],
    ["https://localhost/x.png", 403],
    ["https://nykaa.com.evil.example/x.png", 403],
  ])("rejects %s", (url, status) => {
    const r = checkImageUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(status);
  });
});

describe("normalizeContentType", () => {
  it("allows raster image types", () => {
    expect(normalizeContentType("image/jpeg")).toBe("image/jpeg");
    expect(normalizeContentType("IMAGE/WEBP; charset=binary")).toBe("image/webp");
  });

  it("rejects SVG, HTML and missing types", () => {
    expect(normalizeContentType("image/svg+xml")).toBeNull();
    expect(normalizeContentType("text/html")).toBeNull();
    expect(normalizeContentType(null)).toBeNull();
  });
});
