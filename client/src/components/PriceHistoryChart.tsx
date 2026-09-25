import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { formatPrice } from "@/lib/format";

const W = 320;
const H = 72;
const PAD_X = 6;
const PAD_Y = 10;

export interface PricePoint {
  price: number;
  retailerId: number;
  observedAt: string;
}

/**
 * Best price across sellers for each day, oldest first. History only records
 * changes, so each seller's last known price is carried forward day to day.
 */
export function dailyLows(points: PricePoint[], today = new Date()): { day: Date; price: number }[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const latest = new Map<number, number>();
  const out: { day: Date; price: number }[] = [];

  let i = 0;
  const cursor = new Date(`${sorted[0].observedAt.slice(0, 10)}T12:00:00Z`);
  const end = dayKey(today);
  while (dayKey(cursor) <= end) {
    const key = dayKey(cursor);
    while (i < sorted.length && sorted[i].observedAt.slice(0, 10) <= key) {
      latest.set(sorted[i].retailerId, sorted[i].price);
      i++;
    }
    out.push({ day: new Date(cursor), price: Math.min(...Array.from(latest.values())) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Sparkline of the best price per day across sellers. One series, so no legend:
 * the heading names it. Hover/touch shows the exact day and price.
 */
export function PriceHistoryChart({ points, currency }: { points: PricePoint[]; currency: string }) {
  const series = useMemo(() => dailyLows(points), [points]);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (series.length < 2) return null;

  const prices = series.map((s) => s.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const x = (i: number) => PAD_X + (i / (series.length - 1)) * (W - PAD_X * 2);
  const y = (p: number) => PAD_Y + (1 - (p - min) / span) * (H - PAD_Y * 2);
  const path = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.price).toFixed(1)}`).join(" ");

  const current = series[series.length - 1];
  const lowest = series.reduce((a, b) => (b.price < a.price ? b : a));
  const isLowest = current.price <= lowest.price;
  const shown = active !== null ? series[active] : null;

  const pick = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * (series.length - 1)));
  };

  const summary = `Best price over the last ${series.length} days: lowest ${formatPrice(lowest.price, currency)} on ${format(lowest.day, "d MMM")}, now ${formatPrice(current.price, currency)}.`;

  return (
    <figure className="rounded-2xl border border-border bg-card p-4">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">Best price history</span>
        <span className="text-xs text-muted-foreground">
          {shown
            ? `${format(shown.day, "d MMM")} · ${formatPrice(shown.price, currency)}`
            : isLowest
              ? "Lowest price we've seen"
              : `Lowest ${formatPrice(lowest.price, currency)} on ${format(lowest.day, "d MMM")}`}
        </span>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full h-[72px] touch-none select-none"
        role="img"
        aria-label={summary}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {/* Recessive baseline at the period's lowest price */}
        <line x1={PAD_X} x2={W - PAD_X} y1={y(min)} y2={y(min)} className="stroke-border" strokeWidth={1} strokeDasharray="3 4" />
        <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {active !== null && (
          <>
            <line x1={x(active)} x2={x(active)} y1={PAD_Y / 2} y2={H - PAD_Y / 2} className="stroke-muted-foreground/40" strokeWidth={1} />
            <circle cx={x(active)} cy={y(series[active].price)} r={4.5} className="fill-accent stroke-card" strokeWidth={2} />
          </>
        )}
        {active === null && (
          <circle cx={x(series.length - 1)} cy={y(current.price)} r={4.5} className="fill-accent stroke-card" strokeWidth={2} />
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{format(series[0].day, "d MMM")}</span>
        <span>Today</span>
      </div>
      <p className="sr-only">{summary}</p>
    </figure>
  );
}
