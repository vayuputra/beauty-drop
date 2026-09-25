export interface TrackerState {
  targetPrice: number | null;
  notifyOnAnyDrop: boolean | null;
  baselinePrice: number | null;
  lastNotifiedPrice: number | null;
}

export type AlertDecision =
  | { kind: "none" }
  /** First time we see a price for this tracker: record it, don't alert. */
  | { kind: "set_baseline"; price: number }
  | { kind: "target_reached" | "price_drop"; price: number; previous: number };

/**
 * Decides whether a tracker should alert for the current best price.
 *
 * Alerts only ever fire on a *new low* relative to what the user has already
 * been told about, so an unchanged price never re-alerts on the next run.
 */
export function decidePriceAlert(t: TrackerState, bestPrice: number | null): AlertDecision {
  if (bestPrice == null || !Number.isFinite(bestPrice) || bestPrice <= 0) return { kind: "none" };

  const reference = t.lastNotifiedPrice ?? t.baselinePrice;
  if (reference == null) {
    // No baseline yet (tracker predates baselines). A target already met is still worth telling.
    if (t.targetPrice != null && bestPrice <= t.targetPrice) {
      return { kind: "target_reached", price: bestPrice, previous: bestPrice };
    }
    return { kind: "set_baseline", price: bestPrice };
  }

  if (bestPrice >= reference) return { kind: "none" };

  if (t.targetPrice != null && bestPrice <= t.targetPrice) {
    return { kind: "target_reached", price: bestPrice, previous: reference };
  }
  if (t.notifyOnAnyDrop) {
    return { kind: "price_drop", price: bestPrice, previous: reference };
  }
  return { kind: "none" };
}
