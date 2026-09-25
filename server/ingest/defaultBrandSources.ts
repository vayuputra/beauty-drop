/**
 * Starter list of brand-owned stores believed to run on Shopify. Not verified
 * from the build environment: a sync that can't read a store's /products.json
 * records the error on that source (see Admin → Ingestion), so a wrong entry is
 * visible and can be switched off.
 */
export const DEFAULT_BRAND_SOURCES: { name: string; domain: string; country: "US" | "IN"; currency: "USD" | "INR" }[] = [
  // US
  { name: "Rare Beauty", domain: "www.rarebeauty.com", country: "US", currency: "USD" },
  { name: "Glow Recipe", domain: "www.glowrecipe.com", country: "US", currency: "USD" },
  { name: "Summer Fridays", domain: "summerfridays.com", country: "US", currency: "USD" },
  { name: "Sol de Janeiro", domain: "soldejaneiro.com", country: "US", currency: "USD" },
  { name: "Tower 28", domain: "www.tower28beauty.com", country: "US", currency: "USD" },
  { name: "Kosas", domain: "kosas.com", country: "US", currency: "USD" },
  { name: "Merit", domain: "www.meritbeauty.com", country: "US", currency: "USD" },
  // India
  { name: "Minimalist", domain: "beminimalist.co", country: "IN", currency: "INR" },
  { name: "Plum", domain: "plumgoodness.com", country: "IN", currency: "INR" },
  { name: "Dot & Key", domain: "www.dotandkey.com", country: "IN", currency: "INR" },
  { name: "SUGAR Cosmetics", domain: "in.sugarcosmetics.com", country: "IN", currency: "INR" },
  { name: "Foxtale", domain: "foxtale.in", country: "IN", currency: "INR" },
  { name: "The Derma Co", domain: "thedermaco.com", country: "IN", currency: "INR" },
];
