import { describe, expect, it } from "vitest";
import { decidePriceAlert, type TrackerState } from "./priceAlerts";

const tracker = (over: Partial<TrackerState> = {}): TrackerState => ({
  targetPrice: null,
  notifyOnAnyDrop: true,
  baselinePrice: 100,
  lastNotifiedPrice: null,
  ...over,
});

describe("decidePriceAlert", () => {
  it("does nothing without a usable price", () => {
    expect(decidePriceAlert(tracker(), null)).toEqual({ kind: "none" });
    expect(decidePriceAlert(tracker(), 0)).toEqual({ kind: "none" });
    expect(decidePriceAlert(tracker(), Number.NaN)).toEqual({ kind: "none" });
  });

  it("records a baseline the first time instead of alerting", () => {
    expect(decidePriceAlert(tracker({ baselinePrice: null }), 80)).toEqual({ kind: "set_baseline", price: 80 });
  });

  it("alerts immediately when a target is already met with no baseline", () => {
    expect(decidePriceAlert(tracker({ baselinePrice: null, targetPrice: 90 }), 85)).toMatchObject({ kind: "target_reached", price: 85 });
  });

  it("alerts on a drop below the baseline", () => {
    expect(decidePriceAlert(tracker(), 90)).toEqual({ kind: "price_drop", price: 90, previous: 100 });
  });

  it("does not alert when the price is unchanged or higher", () => {
    expect(decidePriceAlert(tracker(), 100)).toEqual({ kind: "none" });
    expect(decidePriceAlert(tracker(), 120)).toEqual({ kind: "none" });
  });

  it("never re-alerts for a price the user was already told about", () => {
    const afterAlert = tracker({ lastNotifiedPrice: 90 });
    expect(decidePriceAlert(afterAlert, 90)).toEqual({ kind: "none" });
    expect(decidePriceAlert(afterAlert, 95)).toEqual({ kind: "none" });
    expect(decidePriceAlert(afterAlert, 85)).toEqual({ kind: "price_drop", price: 85, previous: 90 });
  });

  it("does not repeat a target-reached alert every run", () => {
    const t = tracker({ targetPrice: 80, lastNotifiedPrice: 75 });
    expect(decidePriceAlert(t, 75)).toEqual({ kind: "none" });
  });

  it("prefers target_reached over price_drop", () => {
    expect(decidePriceAlert(tracker({ targetPrice: 80 }), 79)).toMatchObject({ kind: "target_reached" });
  });

  it("stays quiet on small drops when only a target is wanted", () => {
    const t = tracker({ notifyOnAnyDrop: false, targetPrice: 50 });
    expect(decidePriceAlert(t, 90)).toEqual({ kind: "none" });
    expect(decidePriceAlert(t, 45)).toMatchObject({ kind: "target_reached", price: 45 });
  });
});
