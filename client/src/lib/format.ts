export function formatPrice(price: number, currency: string | null | undefined): string {
  if (currency === "INR") return `₹${Math.round(price).toLocaleString("en-IN")}`;
  return `$${price.toFixed(2)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Launched within the last `days` days (and not in the future). */
export function isNewLaunch(launchedAt: string | Date | null | undefined, days = 14, now = Date.now()): boolean {
  if (!launchedAt) return false;
  const age = now - new Date(launchedAt).getTime();
  return age >= -DAY_MS && age <= days * DAY_MS;
}

/** Short label for where a price came from. */
export function offerSourceLabel(source: string | null | undefined, retailerKind?: string | null): string | null {
  switch (source) {
    case "brand_site":
      return "Official store";
    case "google_shopping":
      return retailerKind === "brand" ? "Official store" : null;
    case "manual":
      return null;
    default:
      return null;
  }
}

/** In-stock offers first (cheapest first), then unknown stock, then sold out. */
export function sortOffers<T extends { price: number; inStock?: boolean | null }>(offers: T[]): T[] {
  const rank = (o: T) => (o.inStock === false ? 2 : o.inStock === true ? 0 : 1);
  return [...offers].sort((a, b) => rank(a) - rank(b) || a.price - b.price);
}

/** Compact relative time for dense rows: "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgoShort(date: string | Date, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(date).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
