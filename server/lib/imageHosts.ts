import { eq } from "drizzle-orm";
import { db } from "../db";
import { brandSources } from "@shared/schema";

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; domains: string[] } | null = null;

/** "www.rarebeauty.com" → "rarebeauty.com", so the store's image subdomains match too. */
export function registrableBrandDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

export function matchesDomains(host: string, domains: string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Some Shopify stores serve product photos from their own domain rather than
 * cdn.shopify.com. Photos from any active watched brand store are allowed.
 */
export async function brandImageHostCheck(): Promise<(host: string) => boolean> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    try {
      const rows = await db.select({ domain: brandSources.domain }).from(brandSources).where(eq(brandSources.active, true));
      cached = { at: Date.now(), domains: rows.map((r) => registrableBrandDomain(r.domain)) };
    } catch {
      cached = { at: Date.now(), domains: cached?.domains ?? [] };
    }
  }
  const domains = cached.domains;
  return (host) => matchesDomains(host, domains);
}

/** Call after brand stores change so the proxy picks them up immediately. */
export function clearBrandImageHosts() {
  cached = null;
}
