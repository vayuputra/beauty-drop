import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
const { needsPhoto, pickListingPhoto } = await import("./jobs");
const { pickSellerOffers } = await import("./googleShopping");
const { matchesDomains, registrableBrandDomain } = await import("../lib/imageHosts");
const { checkImageUrl } = await import("../lib/imageProxy");

const TBN = "https://encrypted-tbn0.gstatic.com/shopping?q=tbn:abc";

describe("needsPhoto", () => {
  it("flags missing, placeholder and broken photos", () => {
    expect(needsPhoto({ imageUrl: "", imageOk: null, imageSource: null })).toBe(true);
    expect(needsPhoto({ imageUrl: "https://placehold.co/600x600?text=x", imageOk: null, imageSource: "curated" })).toBe(true);
    expect(needsPhoto({ imageUrl: "https://cdn.shopify.com/x.jpg", imageOk: false, imageSource: "store" })).toBe(true);
    expect(needsPhoto({ imageUrl: "https://cdn.shopify.com/x.jpg", imageOk: true, imageSource: "store" })).toBe(false);
    expect(needsPhoto({ imageUrl: "https://cdn.shopify.com/x.jpg", imageOk: null, imageSource: "store" })).toBe(false);
  });

  it("leaves a working hand-picked photo alone", () => {
    expect(needsPhoto({ imageUrl: "https://cdn.shopify.com/x.jpg", imageOk: true, imageSource: "manual" })).toBe(false);
  });
});

describe("pickListingPhoto", () => {
  it("prefers the brand's own listing, then the first (cheapest) seller", () => {
    const sellers = [
      { seller: "Ulta", thumbnail: "https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ulta" },
      { seller: "Rare Beauty", thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:own" },
    ];
    expect(pickListingPhoto(sellers, "Rare Beauty")).toContain("tbn:own");
    expect(pickListingPhoto(sellers, "Glossier")).toContain("tbn:ulta");
  });

  it("skips photos the proxy couldn't serve", () => {
    expect(pickListingPhoto([{ seller: "Shady", thumbnail: "https://tracker.example/x.jpg" }, { seller: "Ulta", thumbnail: null }], "X")).toBeNull();
  });
});

describe("shopping thumbnails", () => {
  it("keeps the listing photo alongside the price", () => {
    const [offer] = pickSellerOffers(
      [{ source: "Ulta", title: "Rare Beauty Soft Pinch Liquid Blush", extracted_price: 23, link: "https://www.ulta.com/p", thumbnail: TBN }],
      "Rare Beauty",
      "Soft Pinch Liquid Blush",
    );
    expect(offer.thumbnail).toBe(TBN);
    expect(checkImageUrl(TBN).ok).toBe(true);
  });
});

describe("brand photo hosts", () => {
  it("matches the store's own domain and its subdomains only", () => {
    const domains = [registrableBrandDomain("www.rarebeauty.com")];
    expect(matchesDomains("rarebeauty.com", domains)).toBe(true);
    expect(matchesDomains("www.rarebeauty.com", domains)).toBe(true);
    expect(matchesDomains("images.rarebeauty.com", domains)).toBe(true);
    expect(matchesDomains("rarebeauty.com.evil.example", domains)).toBe(false);
    expect(matchesDomains("notrarebeauty.com", domains)).toBe(false);
  });

  it("lets the proxy accept a custom host check", () => {
    expect(checkImageUrl("https://images.newbrand-beauty.com/a.jpg").ok).toBe(false);
    expect(checkImageUrl("https://images.newbrand-beauty.com/a.jpg", (h) => h.endsWith("newbrand-beauty.com")).ok).toBe(true);
  });
});
