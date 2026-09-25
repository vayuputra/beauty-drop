import { describe, expect, it } from "vitest";
import { dailyLows } from "./PriceHistoryChart";

describe("dailyLows", () => {
  it("carries each seller's price forward and takes the best per day", () => {
    const series = dailyLows(
      [
        { retailerId: 1, price: 30, observedAt: "2026-09-20T10:00:00Z" },
        { retailerId: 2, price: 28, observedAt: "2026-09-20T11:00:00Z" },
        { retailerId: 1, price: 35, observedAt: "2026-09-22T09:00:00Z" }, // expensive seller rises: best stays 28
        { retailerId: 2, price: 25, observedAt: "2026-09-23T09:00:00Z" },
      ],
      new Date("2026-09-24T18:00:00Z"),
    );
    expect(series.map((s) => [s.day.toISOString().slice(0, 10), s.price])).toEqual([
      ["2026-09-20", 28],
      ["2026-09-21", 28],
      ["2026-09-22", 28],
      ["2026-09-23", 25],
      ["2026-09-24", 25],
    ]);
  });

  it("returns nothing without history", () => {
    expect(dailyLows([])).toEqual([]);
  });
});
