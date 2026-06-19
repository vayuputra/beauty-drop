# Beauty Drop — Quality Benchmarks

This project holds itself to two hard, automatically-verified benchmarks. They are
checked by a single honest, code-grounded audit that reads the real source of truth
(the seed catalog, the curated image map, the proxy allowlist, and the shipped client
components) and asserts concrete properties. Nothing is hard-coded to pass.

```bash
npm run audit:benchmarks
```

The command exits non-zero if either benchmark misses its target, so it can gate CI.

## 1. Image Integrity — target **99.5%** (currently 100%)

The goal: **every product always shows an attractive, correct, on-brand image — never a
broken `<img>`, never a misleading generic stock photo.**

How it's achieved:

- **Deterministic on-brand fallback.** `client/src/lib/productImage.ts` generates a
  self-contained SVG "beauty card" per product (category-aware palette + stylised
  vessel + brand/name/category). It needs zero network, so it can never fail to render —
  it works offline and inside the Capacitor Android app. It is clearly a stylised
  illustration, so it is honest: it never passes a generic photo off as the real product.
- **Real photos first, resiliently.** `ProductImage` tries curated official product
  photography (routed through the hot-link-proof `/api/image-proxy`) and only falls back
  to the SVG card if every candidate fails to load.
- **Clean data.** Fabricated / malformed curated URLs were removed; every remaining
  curated URL is https, image-like, and on the proxy allowlist.
- **Hardened proxy.** The image proxy is https-only and restricted to a single
  allowlist (`server/lib/imageProxyDomains.ts`), preventing SSRF.

What the audit checks (92 assertions): an SVG fallback renders for every catalog product;
the generator is robust against hostile input (unbalanced tags / unescaped entities);
no curated image is a stock photo; every curated URL is well-formed, https, image-like
and allowlisted; `resolveProductImage` never returns a stock photo; the allowlist has no
duplicates.

## 2. UX for young female users — target **99%** (currently 100%)

The goal: meet the real needs of the app's core audience. Each check is a concrete,
grep-able property of the shipped client code that maps to a user need — no subjective
grading (28 assertions). Categories:

- **Trust & honesty:** resilient fallback chain, deterministic branded fallback, photos
  proxied, zero legacy stock-photo references.
- **Accessibility:** descriptive `alt` on every product image; `aria-label` on icon-only
  controls (favorite, share); `aria-pressed` on filter chips; `aria-current` on the
  active nav item; reduced-motion respected; lazy-loading + async decoding.
- **Discovery & shopping:** wishlist/save, up-front pricing in ₹ and $, category filters,
  search, side-by-side comparison, thumb-friendly bottom nav, "why it's trending"
  social proof, creator videos.
- **Premium feel:** loading shimmer (no blank flash), smooth image fade-in, native share
  with clipboard fallback, momentum scrolling, helpful loading & empty states.

## Maintaining the benchmarks

When you add products, image sources, or UI, run `npm run audit:benchmarks`. If you add a
curated image host, add it to `server/lib/imageProxyDomains.ts`. New UI should keep the
accessibility and resilience properties the audit enforces.
