import { db } from "../db";
import { priceTrackers, productOffers, products, retailers, notifications } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { decidePriceAlert } from "./priceAlerts";

export { decidePriceAlert } from "./priceAlerts";

function formatMoney(amount: number, currency: string): string {
  return currency === "INR" ? `₹${Math.round(amount).toLocaleString("en-IN")}` : `$${amount.toFixed(2)}`;
}

export interface PriceCheckResult {
  trackersChecked: number;
  alertsSent: number;
}

/**
 * Evaluates every active tracker against the current best offer for its product.
 * Reads offers once per product (not per tracker) and writes no price history —
 * history is recorded when prices are ingested, not when they are merely read.
 */
export async function checkPricesForAllTrackers(): Promise<PriceCheckResult> {
  const trackers = await db.select().from(priceTrackers).where(eq(priceTrackers.isActive, true));
  if (trackers.length === 0) return { trackersChecked: 0, alertsSent: 0 };

  const productIds = Array.from(new Set(trackers.map((t) => t.productId)));
  const offerRows = await db
    .select({ offer: productOffers, retailerName: retailers.name, productName: products.name })
    .from(productOffers)
    .innerJoin(retailers, eq(productOffers.retailerId, retailers.id))
    .innerJoin(products, eq(productOffers.productId, products.id))
    .where(inArray(productOffers.productId, productIds));

  const bestByProduct = new Map<number, (typeof offerRows)[number]>();
  for (const row of offerRows) {
    const current = bestByProduct.get(row.offer.productId);
    if (!current || row.offer.price < current.offer.price) bestByProduct.set(row.offer.productId, row);
  }

  let alertsSent = 0;
  for (const tracker of trackers) {
    const best = bestByProduct.get(tracker.productId);
    const decision = decidePriceAlert(tracker, best?.offer.price ?? null);
    if (decision.kind === "none" || !best) continue;

    try {
      if (decision.kind === "set_baseline") {
        await db.update(priceTrackers).set({ baselinePrice: decision.price }).where(eq(priceTrackers.id, tracker.id));
        continue;
      }

      const { currency } = best.offer;
      const price = formatMoney(decision.price, currency);
      const isTarget = decision.kind === "target_reached";
      const dropPercent = decision.previous > 0 ? ((decision.previous - decision.price) / decision.previous) * 100 : 0;

      await db.insert(notifications).values({
        userId: tracker.userId,
        type: decision.kind,
        title: isTarget ? `Target price reached for ${best.productName}!` : `Price drop on ${best.productName}!`,
        message: isTarget
          ? `${best.productName} is now ${price} at ${best.retailerName}, at or below your target of ${formatMoney(tracker.targetPrice!, currency)}.`
          : `${best.productName} dropped ${dropPercent.toFixed(1)}% to ${price} at ${best.retailerName}.`,
        data: {
          productId: tracker.productId,
          oldPrice: decision.previous,
          newPrice: decision.price,
          retailerName: best.retailerName,
        },
      });
      await db
        .update(priceTrackers)
        .set({
          lastNotifiedPrice: decision.price,
          lastNotifiedAt: new Date(),
          baselinePrice: tracker.baselinePrice ?? decision.previous,
        })
        .where(eq(priceTrackers.id, tracker.id));
      alertsSent++;
    } catch (error) {
      console.error(`Price check failed for tracker ${tracker.id}:`, error);
    }
  }

  return { trackersChecked: trackers.length, alertsSent };
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let priceCheckInterval: NodeJS.Timeout | null = null;

function runCheck(label: string) {
  checkPricesForAllTrackers()
    .then((r) => console.log(`${label}: checked ${r.trackersChecked} trackers, sent ${r.alertsSent} alerts.`))
    .catch((err) => console.error(`${label} failed:`, err));
}

/**
 * For the long-running server (`npm start`). On Vercel the same check runs from
 * the `/api/cron/price-check` cron route instead.
 */
export function startPriceCheckJob(): void {
  if (priceCheckInterval) return;
  console.log("Starting background price check job (every 6 hours)");
  priceCheckInterval = setInterval(() => runCheck("Scheduled price check"), SIX_HOURS_MS);
  runCheck("Initial price check");
}

export function stopPriceCheckJob(): void {
  if (priceCheckInterval) {
    clearInterval(priceCheckInterval);
    priceCheckInterval = null;
  }
}
