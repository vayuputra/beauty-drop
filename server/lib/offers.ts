export interface OfferLike {
  price: number;
  currency: string;
  inStock: boolean | null;
}

export interface PriceSummary {
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  /** True when every offer is known to be sold out. */
  soldOut: boolean;
}

/**
 * Price range shown on product cards. Sold-out offers are ignored unless every
 * offer is sold out, so "Starting at" is always a price you can actually buy at.
 */
export function summarizeOffers(offers: OfferLike[]): PriceSummary {
  const priced = offers.filter((o) => Number.isFinite(o.price) && o.price > 0);
  if (priced.length === 0) return { minPrice: null, maxPrice: null, currency: null, soldOut: false };

  const buyable = priced.filter((o) => o.inStock !== false);
  const pool = buyable.length > 0 ? buyable : priced;
  const prices = pool.map((o) => o.price);
  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    currency: pool[0].currency,
    soldOut: buyable.length === 0,
  };
}
