import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { buildAmazonCartUrl, buildShopifyCartUrl, checkoutModeFor, extractAsin } from "./plan";
import { assertNoPaymentStep, isPaymentAction, isPaymentUrl } from "./paymentGuard";
import { addressFieldsSchema, splitName } from "./address";
import { decryptJson, encryptJson } from "../lib/crypto";

const brandProduct = { brandSourceId: 1, productUrl: "https://www.rarebeauty.com/products/lip-oil", country: "US" };

describe("checkoutModeFor", () => {
  it("prepares a pre-filled cart for a brand's own Shopify store", () => {
    const offer = { source: "brand_site", affiliateUrl: "https://www.rarebeauty.com/products/lip-oil", retailer: { name: "Rare Beauty", kind: "brand" } };
    expect(checkoutModeFor(offer, brandProduct, true)).toBe("cart_permalink");
    expect(checkoutModeFor(offer, brandProduct, false)).toBe("handoff"); // needs a variant id
    expect(checkoutModeFor(offer, { ...brandProduct, brandSourceId: null }, true)).toBe("handoff");
  });

  it("never treats another store's listing as the brand store", () => {
    const offer = { source: "brand_site", affiliateUrl: "https://evil.example/products/lip-oil", retailer: { name: "Rare Beauty" } };
    expect(checkoutModeFor(offer, brandProduct, true)).toBe("handoff");
  });

  it("uses Amazon's add-to-cart link only when the ASIN is known", () => {
    const withAsin = { source: "google_shopping", affiliateUrl: "https://www.amazon.com/Rare-Beauty/dp/B0ABCDEF12?tag=x", retailer: { name: "Amazon" } };
    const withoutAsin = { source: "demo", affiliateUrl: "https://www.amazon.com/s?k=rare+beauty", retailer: { name: "Amazon" } };
    expect(checkoutModeFor(withAsin, brandProduct, true)).toBe("amazon_cart");
    expect(checkoutModeFor(withoutAsin, brandProduct, true)).toBe("handoff");
  });

  it("hands everything else to the seller's page", () => {
    const offer = { source: "google_shopping", affiliateUrl: "https://www.sephora.com/product/x", retailer: { name: "Sephora" } };
    expect(checkoutModeFor(offer, brandProduct, true)).toBe("handoff");
  });
});

describe("extractAsin", () => {
  it.each([
    ["https://www.amazon.com/dp/B0ABCDEF12", "B0ABCDEF12"],
    ["https://www.amazon.in/Some-Name/dp/b0abcdef12/ref=sr_1", "B0ABCDEF12"],
    ["https://www.amazon.com/gp/product/B0ABCDEF12?psc=1", "B0ABCDEF12"],
    ["https://www.amazon.com/s?k=lip", null],
    ["https://amazon.evil.com/dp/B0ABCDEF12", null],
  ])("%s → %s", (url, asin) => expect(extractAsin(url)).toBe(asin));
});

const address = {
  fullName: "Priya Sharma Rao",
  phone: "+91 98765 43210",
  line1: "12 Carter Road",
  line2: "Flat 4",
  city: "Mumbai",
  state: "Maharashtra",
  postalCode: "400050",
  country: "IN" as const,
};

describe("buildShopifyCartUrl", () => {
  it("adds the exact variant and pre-fills checkout when consented", () => {
    const url = new URL(buildShopifyCartUrl({ domain: "plumgoodness.com", variantExternalId: "4455", quantity: 2, email: "p@example.com", address }));
    expect(url.origin + url.pathname).toBe("https://plumgoodness.com/cart/4455:2");
    expect(url.searchParams.get("checkout[email]")).toBe("p@example.com");
    expect(url.searchParams.get("checkout[shipping_address][first_name]")).toBe("Priya Sharma");
    expect(url.searchParams.get("checkout[shipping_address][last_name]")).toBe("Rao");
    expect(url.searchParams.get("checkout[shipping_address][zip]")).toBe("400050");
    expect(url.searchParams.get("checkout[shipping_address][country]")).toBe("India");
    expect(url.searchParams.get("checkout[shipping_address][province]")).toBe("Maharashtra");
  });

  it("shares nothing personal without consent", () => {
    const url = buildShopifyCartUrl({ domain: "plumgoodness.com", variantExternalId: "4455", quantity: 1 });
    expect(url).not.toMatch(/checkout%5B|checkout\[/);
  });

  it("uses full US state names, clamps quantity and rejects odd variant ids", () => {
    const us = { ...address, country: "US" as const, state: "CA", postalCode: "94107", phone: "4155550123" };
    const url = new URL(buildShopifyCartUrl({ domain: "x.com", variantExternalId: "1", quantity: 99, address: us }));
    expect(url.pathname).toBe("/cart/1:10");
    expect(url.searchParams.get("checkout[shipping_address][province]")).toBe("California");
    expect(() => buildShopifyCartUrl({ domain: "x.com", variantExternalId: "1/../admin", quantity: 1 })).toThrow();
  });
});

describe("buildAmazonCartUrl", () => {
  it("builds the Associates add-to-cart link for the right marketplace", () => {
    const url = new URL(buildAmazonCartUrl({ country: "IN", asin: "B0ABCDEF12", quantity: 1, associateTag: "bd-21" }));
    expect(url.host).toBe("www.amazon.in");
    expect(url.pathname).toBe("/gp/aws/cart/add.html");
    expect(url.searchParams.get("ASIN.1")).toBe("B0ABCDEF12");
    expect(url.searchParams.get("AssociateTag")).toBe("bd-21");
  });
});

describe("payment guard", () => {
  it.each([
    [{ text: "Place order" }],
    [{ text: "Pay now" }],
    [{ text: "Pay ₹1,249" }],
    [{ text: "Complete purchase" }],
    [{ text: "Checkout with PayPal" }],
    [{ name: "cardNumber" }],
    [{ name: "cvv" }],
    [{ name: "upi-id" }],
    [{ name: "atm_pin" }],
    [{ autocomplete: "cc-exp" }],
    [{ url: "https://api.razorpay.com/v1/checkout" }],
    [{ url: "https://shop.example/checkout/payment" }],
  ])("blocks %j", (action) => expect(isPaymentAction(action)).toBe(true));

  it.each([
    [{ text: "Add to cart" }],
    [{ text: "Continue to shipping" }],
    [{ name: "pincode" }],
    [{ name: "PIN code" }],
    [{ name: "shipping_address[zip]" }],
    [{ autocomplete: "postal-code" }],
    [{ url: "https://plumgoodness.com/cart/1:1" }],
    [{ url: "https://www.amazon.in/gp/aws/cart/add.html?ASIN.1=B0ABCDEF12" }],
  ])("allows %j", (action) => expect(isPaymentAction(action)).toBe(false));

  it("rejects payment URLs at hand-off", () => {
    expect(() => assertNoPaymentStep("https://checkout.stripe.com/pay/x")).toThrow();
    expect(assertNoPaymentStep("https://x.com/cart/1:1")).toBe("https://x.com/cart/1:1");
    expect(isPaymentUrl("not a url")).toBe(false);
  });
});

describe("address validation", () => {
  it("accepts a valid Indian address", () => {
    expect(addressFieldsSchema.safeParse(address).success).toBe(true);
  });

  it.each([
    [{ postalCode: "40005" }, "postalCode"],
    [{ postalCode: "012345" }, "postalCode"],
    [{ state: "Maharastra" }, "state"],
    [{ phone: "12345" }, "phone"],
  ])("rejects %j", (patch, path) => {
    const r = addressFieldsSchema.safeParse({ ...address, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(path);
  });

  it("validates US ZIP codes and states", () => {
    const us = { ...address, country: "US", state: "NY", postalCode: "10001-1234", phone: "(212) 555-0123" };
    expect(addressFieldsSchema.safeParse(us).success).toBe(true);
    expect(addressFieldsSchema.safeParse({ ...us, state: "Maharashtra" }).success).toBe(false);
  });

  it("splits names for checkout forms", () => {
    expect(splitName("Priya")).toEqual({ first: "Priya", last: "" });
    expect(splitName("  Ana  de  Souza ")).toEqual({ first: "Ana de", last: "Souza" });
  });
});

describe("encryption at rest", () => {
  const key = crypto.randomBytes(32);

  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptJson(address, key);
    const b = encryptJson(address, key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("Carter");
    expect(decryptJson(a, key)).toEqual(address);
  });

  it("detects tampering and wrong keys", () => {
    const payload = encryptJson(address, key);
    const parts = payload.split(".");
    const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA")].join(".");
    expect(() => decryptJson(tampered, key)).toThrow();
    expect(() => decryptJson(payload, crypto.randomBytes(32))).toThrow();
  });
});
