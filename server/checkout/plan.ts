import type { AddressFields } from "./address";
import { splitName, US_STATES } from "./address";

/**
 * How the agent gets a seller's cart ready. None of these can pay: each ends on
 * the seller's own checkout page with payment left to the user.
 *
 * - cart_permalink: Shopify brand store. The cart link adds the exact shade and
 *   pre-fills contact + shipping details on the store's checkout.
 * - amazon_cart: Amazon's documented add-to-cart link (Amazon is never automated).
 * - handoff: open the seller's product page; the browser agent comes later.
 */
export type CheckoutMode = "cart_permalink" | "amazon_cart" | "handoff";

export interface OfferForPlan {
  source: string;
  affiliateUrl: string;
  retailer: { name: string; kind?: string | null; domain?: string | null };
}

export interface ProductForPlan {
  brandSourceId: number | null;
  productUrl: string | null;
  country: string;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i;

/** The 10-character Amazon product id in a product URL, if there is one. */
export function extractAsin(url: string): string | null {
  const host = hostOf(url);
  if (!host || !/(^|\.)amazon\.(com|in)$/.test(host)) return null;
  const m = new URL(url).pathname.match(ASIN_RE);
  return m ? m[1].toUpperCase() : null;
}

export function isAmazon(offer: OfferForPlan): boolean {
  return /amazon/i.test(offer.retailer.name) || /(^|\.)amazon\./.test(hostOf(offer.affiliateUrl) ?? "");
}

export function checkoutModeFor(offer: OfferForPlan, product: ProductForPlan, hasVariants: boolean): CheckoutMode {
  if (isAmazon(offer)) return extractAsin(offer.affiliateUrl) ? "amazon_cart" : "handoff";
  const offerHost = hostOf(offer.affiliateUrl);
  const brandHost = hostOf(product.productUrl);
  if (
    offer.source === "brand_site" &&
    product.brandSourceId != null &&
    hasVariants &&
    offerHost != null &&
    offerHost === brandHost
  ) {
    return "cart_permalink";
  }
  return "handoff";
}

const COUNTRY_NAME: Record<string, string> = { IN: "India", US: "United States" };

/**
 * Shopify cart permalink: /cart/<variant>:<qty> plus the documented
 * checkout[...] pre-fill parameters. Personal details are only added when the
 * user consented for this order.
 */
export function buildShopifyCartUrl(input: {
  domain: string;
  variantExternalId: string;
  quantity: number;
  email?: string | null;
  address?: AddressFields | null;
}): string {
  if (!/^\d+$/.test(input.variantExternalId)) throw new Error("Invalid Shopify variant id");
  const qty = Math.min(Math.max(Math.trunc(input.quantity) || 1, 1), 10);
  const url = new URL(`https://${input.domain}/cart/${input.variantExternalId}:${qty}`);
  const p = url.searchParams;
  if (input.email) p.set("checkout[email]", input.email);
  if (input.address) {
    const a = input.address;
    const { first, last } = splitName(a.fullName);
    p.set("checkout[shipping_address][first_name]", first);
    if (last) p.set("checkout[shipping_address][last_name]", last);
    p.set("checkout[shipping_address][address1]", a.line1);
    if (a.line2) p.set("checkout[shipping_address][address2]", a.line2);
    p.set("checkout[shipping_address][city]", a.city);
    p.set("checkout[shipping_address][province]", a.country === "US" ? US_STATES[a.state] ?? a.state : a.state);
    p.set("checkout[shipping_address][country]", COUNTRY_NAME[a.country]);
    p.set("checkout[shipping_address][zip]", a.postalCode);
  }
  p.set("attributes[referrer]", "Beauty Drop");
  return url.toString();
}

/** Amazon Associates "add to cart" link: the user reviews the cart on Amazon. */
export function buildAmazonCartUrl(input: { country: string; asin: string; quantity: number; associateTag?: string | null }): string {
  const host = input.country === "IN" ? "www.amazon.in" : "www.amazon.com";
  const url = new URL(`https://${host}/gp/aws/cart/add.html`);
  url.searchParams.set("ASIN.1", input.asin);
  url.searchParams.set("Quantity.1", String(Math.min(Math.max(Math.trunc(input.quantity) || 1, 1), 10)));
  if (input.associateTag) url.searchParams.set("AssociateTag", input.associateTag);
  return url.toString();
}

export function amazonAssociateTag(country: string): string | null {
  return (country === "IN" ? process.env.AMAZON_ASSOCIATE_TAG_IN : process.env.AMAZON_ASSOCIATE_TAG_US) || null;
}
