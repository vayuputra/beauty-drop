/**
 * Single source of truth for hosts the image proxy is allowed to fetch from.
 * Used by the `/api/image-proxy` route and by the image-integrity audit, so the
 * allowlist and the curated product-image URLs can never silently drift apart.
 */
export const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  // Retailer & marketplace CDNs
  "images-static.nykaa.com",
  "www.nykaa.com",
  "nykaa.com",
  "www.purplle.com",
  "purplle.com",
  "www.myntra.com",
  "myntra.com",
  "assets.myntassets.com",
  "www.tirabeauty.com",
  "tirabeauty.com",
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "images.amazon.com",
  "cdn.shopify.com",
  "www.sephora.com",
  "sephora.com",
  "www.sephora.me",
  "images.ulta.com",
  "www.ulta.com",
  // Brand sites
  "theordinary.com",
  "www.theordinary.com",
  "soldejaneiro.com",
  "www.soldejaneiro.com",
  "www.glowrecipe.com",
  "glowrecipe.com",
  "images.glossier.com",
  "www.glossier.com",
  "www.rarebeauty.com",
  "rarebeauty.com",
  "www.clinique.com",
  "clinique.com",
  "www.cosrx.com",
  "cosrx.com",
  "beminimalist.co",
  "plumgoodness.com",
  "www.sugarcosmetics.com",
  "sugarcosmetics.com",
  "www.dotandkey.com",
  "dotandkey.com",
  "www.maybelline.com",
  "maybelline.com",
  "www.maybelline.co.in",
  "maybelline.co.in",
  "www.lakmeindia.com",
  "lakmeindia.com",
  "www.forestessentialsindia.com",
  "forestessentialsindia.com",
  "www.kaybeauty.in",
  "kaybeauty.in",
  "www.summerfridays.com",
  "summerfridays.com",
];

/** True if `hostname` is on the allowlist (exact match or a subdomain of one). */
export function isAllowedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_IMAGE_HOSTS.some((domain) => h === domain || h.endsWith("." + domain));
}
