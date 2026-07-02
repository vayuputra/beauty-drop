# Beauty Drop — Code Review: Data Authenticity, UX/UI, and Enhancement Roadmap

_Review date: 2026-07-02. Scope: full codebase (client, server, shared schema, python_fetcher, scripts, deployment config). TypeScript compiles cleanly (`npx tsc` exit 0)._

---

## Executive summary

The app is well-architected on the surface — clean Drizzle schema, typed React Query hooks, a hardened image proxy, a real Python scraping service — but **the core product promise is not currently backed by real data**. No price, offer, video, trust score, or review shown to users comes from a live source at runtime:

1. **All products and prices are a hardcoded seed** (`server/routes.ts:1355–2270`). "Multi-retailer price comparison" is one invented base price multiplied by fixed constants per retailer.
2. **The real price-fetching service (python_fetcher) is never started, and its only DB-persisting integration is dead code.** The one refresh endpoint the client uses has an incompatible API contract and returns a fabricated success message.
3. **Trust scores, review summaries, Reddit sentiment, and articles are LLM-generated estimates**, not measured data — and 30% of every trust score is a hardcoded constant `50`.
4. Several user-facing features are broken end-to-end: the Weekly Digest page renders fields the API never returns, editing preferences is unreachable due to an onboarding redirect loop, email/password auth is a dead end, and price alerts can mathematically never fire.

The good news: most of the machinery to make the data real already exists in the repo — it just isn't wired together. Section 7 lays out a prioritized plan.

---

## 1. Data authenticity — does fetched data match the actual product?

**Short answer: no.** Here is the full data-provenance map.

### 1.1 Products & prices: hardcoded seed with multiplier-derived "comparison"

- The entire catalog is 8 US + 12 IN hand-written products seeded on every non-production boot (`server/routes.ts:1348–1350`, `1355–2270`). There is no ingestion pipeline. "Weekly drops" = this static list sorted by `influencerCount`.
- Multi-retailer prices are arithmetic on one made-up number:
  - US: Sephora = base, Ulta = ×0.95 (`routes.ts:2139`), Amazon = ×0.92 (`routes.ts:2148`)
  - IN: Nykaa = base, Purplle = ×0.9, Amazon.in = ×0.95, Myntra = ×0.88, Tata CLiQ = ×0.93, Sephora IN = ×1.05 (`routes.ts:2205–2241`)
- "Affiliate" URLs are retailer **search pages** with no affiliate tags (e.g. `https://www.sephora.com/search?keyword=...`, `routes.ts:2132, 2150, 2225`). Monetization is cosmetic; the Myntra URL pattern is guessed and likely 404s.
- `whyTrending` copy ("10M+ TikTok views") is invented (`routes.ts:1426, 1548`).

### 1.2 The price-refresh pipeline is disconnected at every joint

- Nothing starts `python_fetcher` (no workflow, Procfile, or deploy config; repo-root `main.py` is a leftover "Hello" stub). `PYTHON_FETCHER_URL` defaults to `http://localhost:8000` and every failure silently returns `[]` (`server/services/priceFetcher.ts:5, 84–88`).
- `updateProductPricesFromFetch` (`priceFetcher.ts:111–171`) is **the only function that persists fetched prices to the DB, and it has zero call sites** — dead code.
- `POST /api/products/:id/refresh-prices` (`routes.ts:347–442`) — the only refresh path the client actually uses — is protocol-broken: it sends `{product_name, country}` but Python's `/refresh` expects `{product_name, brand, retailers}` and returns `{status, message, product}`, never a `price` field (`python_fetcher/main.py:126–152`). The price-update branch (`routes.ts:394–410`) is unreachable. The fallback just bumps `lastUpdated = now` on unchanged offers and responds **"Prices refreshed for N retailers"** (`routes.ts:417–437`) — a fabricated success that also falsifies the freshness signal.
- The 6-hour "background price check" (`server/services/priceChecker.ts`) reads the offer price **from the DB and compares it against price history it wrote itself** (`priceChecker.ts:52–75`). It never contacts a retailer. Consequences:
  - Price-drop alerts can never fire from market movement (prices never change).
  - Target-price alerts re-fire every 6h with no `lastNotifiedAt` dedupe (`priceChecker.ts:79, 107–109`).
  - `priceHistory` fills with duplicate rows (one per tracker per offer per run), and the digest's "volatility" math runs over this fake, inflated history.
- On Vercel, none of this runs at all: `startPriceCheckJob` is only called in `server/index.ts:145`, never in `server/vercel.ts` — so the deployed app has no background jobs whatsoever.

### 1.3 Trust scores: 70% LLM guess + 30% hardcoded constant

- "Reddit sentiment" is a Perplexity `sonar` completion asked to *estimate* sentiment, mention counts, and source URLs (`server/services/trustScore.ts:30–148`). Nothing validates the returned URLs are real Reddit threads. Missing key or parse failure silently yields neutral 50 / 0 mentions — indistinguishable from a real neutral result.
- Engagement authenticity is **always 50**: `generateProductTrustScore` is only ever called without engagement metrics (`routes.ts:738`), so `calculateEngagementAuthenticity([])` returns the placeholder (`trustScore.ts:198, 238–241`). The bot-detection heuristics (`trustScore.ts:150–205`) are dead code with no data feed.
- Net formula: `trustScore = 0.7 × (LLM estimate) + 0.3 × 50`, then presented to users as "Highly Trusted" / "Red Flags".

### 1.4 Review synthesis: explicitly fabricated review counts

- GPT-4o is prompted to summarize reviews "based on your knowledge" — no reviews are fetched from anywhere — and to produce an "Estimated source breakdown (approximate review counts)" (`server/services/reviewSynthesis.ts:28–108`). Those invented counts are stored in `productReviewSummaries.sources` and rendered as "~N reviews" per platform (`client/src/components/ReviewSummary.tsx:103`).

### 1.5 Influencer videos: fabricated, attributed to real people

- The seed includes a Rickroll (`youtube.com/embed/dQw4w9WgXcQ`) attributed to "Jackie Aina, 3.5M" (`routes.ts:1434–1439`), nonexistent embed IDs (`embed/example1`, `lipbutter1`, `kajal1`…), fake TikTok IDs, Unsplash stock photos as thumbnails, and invented follower counts attached to real influencers' names (Mikayla Nogueira, NikkieTutorials, Alix Earle, Shreya Jain…). The seeder papers over this by rewriting `videoUrl` to a YouTube **search results** URL while still inserting the fake `embedUrl` (`routes.ts:2158–2165, 2251–2258`). This is a reputational/legal risk, not just a data-quality one.
- The Perplexity refresh path (`routes.ts:200–270`) is real search but LLM-mediated: names, handles, follower counts, and URLs are unverified model output; only YouTube URLs get structural validation (`services/perplexity.ts:1–15, 140–146`).

### 1.6 Images: curated map, honest fallback, but no real "guarantee"

- Images resolve from a hand-curated 22-entry map of retailer CDN URLs (`services/perplexity.ts:163–253`) → `placehold.co` placeholder → client-side deterministic SVG fallback. The proxy (`routes.ts:622–681`) is https-only, allowlisted, content-type-checked — genuinely decent.
- But nothing verifies a curated URL depicts the right product. The map contains a wrong-brand key (`'dot & key compact powder spf 15'` vs the seeded **Lakme** compact, `perplexity.ts:224–227`) and entries for products not in the catalog; two catalog products have no curated image at all.
- GPT-4o image verification **fails open**: any error returns `isAuthentic: true, confidence: 50` (`services/imageVerification.ts:87–96`), the route defaults `verified = true` on exceptions (`routes.ts:294–297`), and the acceptance threshold (≥40) is below the failure default. Batch `/api/refresh-images` skips verification entirely (`routes.ts:559–619`).
- `BENCHMARKS.md`'s "Image Integrity 100%" is measured by `script/audit.ts`, which only regex-checks URL *shape* in source code — it never fetches an image or verifies it matches the product. The benchmark measures assertion design, not data truth.

### 1.7 Python fetcher: real fetching, but authenticity gaps even when running

- SerpAPI Google Shopping results are taken as `shopping_results[0]` **without checking the merchant matches the requested retailer** (`python_fetcher/fetcher.py:84, 100–102`) — a "Nykaa" price can come from any merchant.
- `extracted_price` (a bare number) defaults to USD in the normalizer (`price_normalizer.py:19–20`) — an INR price recorded as USD is an ~83× error. FX rates are hardcoded (`price_normalizer.py:5–6`).
- Scrape queries drop the brand (`fetcher.py:193`, `scraper.py:153`) and take the first search hit as *the* product. Selectors are fragile, one static UA, no proxy rotation — Amazon/Sephora will CAPTCHA it quickly.
- Image verification failures still return the image (`fetcher.py:216–217`), and Node persists it regardless of `image_verified` (`priceFetcher.ts:79`).

### 1.8 Client-side data mismatches (UI renders fields that don't exist)

- **Weekly Digest page is dead**: `Digest.tsx` renders `weekRange`, `priceMovers`, `trending`, `newProducts`, `mentionCount` — the API returns only `{weekStartDate, topProducts, summary}` (`server/services/weeklyDigest.ts:94–98`). Users only ever see the summary paragraph. Also, `change` is server-side `Math.abs(...)` so the client's green "price drop" branch (`change < 0`) could never fire even if the fields matched.
- **"In Stock" is hardcoded** for every offer (`ProductDetails.tsx:554–556`); no availability field exists in the schema.
- **"Trending" isn't trending**: `getTrendingProductsByCountry` returns *all* products for a country sorted by `influencerCount` (`server/storage.ts:100–106`), and the Home "Trending" chip just re-sorts the same list.
- **"Curated for 🇮🇳/🇺🇸" isn't curated**: onboarding collects interests/skin type/budget, but no server query ever uses `preferences` — it's a raw country filter.
- Offers show prices with no staleness indicator despite `productOffers.lastUpdated` existing in the schema.
- `ProductImage`'s `imageCandidates` fallback chain is dead — no API response includes that field.

---

## 2. Critical bugs (broken end-to-end flows)

1. **Email/password auth is non-functional** — register/login set `req.session.userId` (`routes.ts:1064, 1090`) but nothing anywhere reads it; every protected route checks Passport's `req.isAuthenticated()`/`claims.sub`. Email users get 401 on everything. (Also: no client UI calls these endpoints, and `registerAuthRoutes` in `server/auth/routes.ts` is never mounted.)
2. **Onboarding redirect loop blocks preference editing** — Settings deep-links to `/onboarding` (`Settings.tsx:72, 78`), but `Onboarding.tsx:44–48` bounces any user with a `country` straight back to `/`. Editing region/interests is unreachable.
3. **Toasts never auto-dismiss** — `TOAST_REMOVE_DELAY = 1000000` (~16.7 min) with `TOAST_LIMIT = 1` (`use-toast.ts:8–9`), the classic shadcn footgun.
4. **Compare table collapses for 3–4 products** — `grid-cols-${values.length}` (`Compare.tsx:229`) is a dynamic Tailwind class that is never generated; only 2-column compare renders correctly.
5. **Unhandled async rejections across the API** — Express 4 with dozens of async handlers lacking try/catch (`routes.ts:37–58, 79–102, 152–197, 684–726, 1095–1136, 1185–1243, 1246–1334`). Any DB error hangs the request; the error middleware never runs.
6. **PATCH `/api/user` returns the raw DB row including `passwordHash`** (`routes.ts:60–69`, `shared/models/auth.ts:19`).
7. **Analytics cache ignores `days`** — cache key `analytics:clicks` (`routes.ts:1247`) returns 30-day data for `?days=7`.
8. **Refresh endpoints don't invalidate caches** — after `refresh-influencers`/`refresh-all`, `product:{id}` and `drops:*` stay stale for up to 5 min, so the user who tapped Refresh sees nothing change.
9. **Influencer refresh is destructive and non-transactional** — delete-then-insert (`routes.ts:226–240`); an empty LLM result wipes previously good data.
10. **Currency formatting is asymmetric** — card branches `INR ? ₹ : $` while details branch `USD ? $ : ₹` with different decimal rules (`ProductCard.tsx:12–17` vs `ProductDetails.tsx:562–564`). No shared `formatCurrency` util.
11. **Naive timestamp parsing** — Postgres `timestamp` (no tz) parsed as local time makes "5h ago" wrong by the user's UTC offset (`Notifications.tsx:32–44`).
12. **Undefined CSS variables** — Tailwind references `--card`, `--popover`, `--chart-1..5`, `--sidebar*` that are never defined in `index.css`; every `bg-card` panel silently renders transparent, and the sprinkled `dark:` classes can never work (no dark-theme variables exist).
13. **Favorites list order is arbitrary** — IDs sorted by `createdAt` then re-fetched via `inArray` without re-sorting (`storage.ts:334–368`).
14. **Search wildcards unescaped** — `q=%` matches everything (`storage.ts:164`).

---

## 3. Security findings

1. **Image-proxy SSRF via redirects** — allowlist is checked only on the initial URL; `fetch` follows redirects, so an allowlisted host (any `cdn.shopify.com` tenant, or an open redirect on a retailer domain) can bounce the proxy to internal endpoints (`routes.ts:622–681`). Also: no fetch timeout, and the 10MB cap is enforced *after* fully buffering the body. Fix: `redirect: 'manual'` (or re-validate final URL), `AbortSignal.timeout`, stream with a size guard.
2. **Unauthenticated business analytics** — `GET /api/analytics/clicks` and `/api/analytics/overview` (`routes.ts:1246, 1309`) expose user counts and click-through data to anyone.
3. **No admin role** — any logged-in user can run batch Perplexity jobs (`/api/refresh-trending`, `/api/refresh-images` — direct API-cost abuse), flush the entire cache (`/api/cache/invalidate`), and insert digest rows.
4. **`ssl: { rejectUnauthorized: false }` in production** (`server/db.ts:15`) — DB TLS is unverified.
5. **Fail-open image verification** (§1.6) — an OpenAI outage makes everything "verified".
6. **No brute-force protection on login** beyond the global 100 req/15 min limiter; no `SESSION_SECRET` startup assertion (`auth/googleAuth.ts:43`).
7. Python service: CORS `allow_origins=["*"]` with `allow_credentials=True` and an unauthenticated `/cache/clear` (`python_fetcher/main.py:40–46, 160–163`).

---

## 4. UX/UI enhancement opportunities

### States & feedback
- **No `isError` handling anywhere.** Failed requests render misleading empty states: Wishlist shows "No saved products yet" on a network error; Home shows "No Trending Products Yet"; ProductDetails shows "Product not found" (with no back button) for any non-404 failure. Add error branches with retry buttons.
- Replace the single full-screen `Loader` with **skeleton cards** — `ui/skeleton.tsx` is already in the repo, unused. `Compare.tsx:91–92` even renders the 50vh Loader *inside a button*.
- **No optimistic updates**: the wishlist heart only flips after POST + refetch; on slow networks it feels dead. Same for mark-read and price trackers. No success/failure toasts on favorite toggles at all.
- **No pull-to-refresh** in a mobile-first Capacitor app — and `overscroll-behavior-y: contain` (`index.css:55`) actively disables the native affordance.
- `@capacitor/haptics` is installed and never imported — favorite toggle and refresh are natural spots.

### Navigation
- ProductDetails back button is hardcoded `href="/"` (`ProductDetails.tsx:116`) — arriving from Search/Wishlist/Compare loses context. Use `history.back()`.
- No scroll restoration or `scrollTo(0,0)` on route change.
- Settings "Account Details" is a dead button with a chevron (`Settings.tsx:114–118`).
- Onboarding: no back button between steps; `updateUser` failure has no `onError` (user silently stuck); fixed-bottom Next buttons can overlap content on short screens.

### Search
- **No debounce** — every keystroke ≥2 chars fires `/api/search` (an ILIKE across 4 columns), and no `keepPreviousData` means results flash to a full-screen loader per keystroke.
- No filters, no sort, no recent searches, no clear-input button, no hint that the minimum is 2 characters.

### Accessibility
- `maximum-scale=1` in the viewport meta disables pinch-zoom (WCAG 1.4.4 failure, `client/index.html:5`).
- Clickable `div`s with no `role`/`tabIndex`/keyboard handling: influencer cards, discussion/article rows, compare slots, notification cards.
- Touch targets below 44px: card heart 32px (`ProductCard.tsx:55`), compare remove 24px.
- The Compare bottom sheet is a plain div — no focus trap, no Escape, no `aria-modal` — despite `ui/drawer.tsx`/`ui/sheet.tsx` existing.

### Consumer/admin separation
- Operator tools live in the consumer UI: the Analytics dashboard (total users, affiliate clicks), "Refresh Trending/Images/Prices" buttons on Home and product pages. Move behind an admin role (see §3.3).

### Performance
- **Fonts are the biggest easy win**: `index.html:12` loads ~25 Google font families while `index.css:1` re-imports two of them render-blockingly; only Inter + Playfair are used. (`--font-serif`/`--font-mono` referenced in Tailwind config are never defined.)
- No route-level code splitting — all 11 pages ship eagerly (`App.tsx:10–20`); no `React.memo` anywhere; every ProductCard subscribes to the favorites cache so one heart toggle re-renders the whole feed.
- Image proxy has no resize/format param — full-res retailer images are fetched into small thumbnails; no `srcset`.
- `useWeeklyDigest` triggers full server-side digest regeneration (N+1 over every product) on a casual GET; the cached `/api/weekly-digest/latest` endpoint exists and is unused.

---

## 5. API design issues

- **No pagination anywhere** (`/api/drops`, `/api/search`, `/api/favorites`, analytics); notifications hard-cap 50 with no cursor.
- **N+1 chains**: `/api/compare` ≈ 24 sequential queries for 4 products; digest does 2 queries per product; product page requires 4–6 round-trips because `GET /api/products/:id` omits `trustScore`/`reviewSummary` despite `ProductWithDetails` declaring them.
- **Global 100 req/15 min rate limit** is far too low for an SPA polling notifications each minute; on Vercel the per-instance counters make it both leaky and unpredictable.
- **Blocking LLM calls in request path**: first-hit articles/trust-score/review-summary block a user request on a multi-second Perplexity/GPT round-trip; batch refreshes run minutes inside one HTTP request (exceeds Vercel's 30s `maxDuration`).
- Inconsistent envelopes (`sendStatus(401)` vs `{message}` vs `{error}`; `{exists:false}` vs 404). Only 4 of ~44 routes use the typed `shared/routes.ts` contract — which is exactly how the Digest payload mismatch shipped.
- Client-side click tracking then `window.open` loses clicks when the mutation fails; the atomic `/api/go/:offerId` endpoint exists server-side and is never used by the client.

---

## 6. Half-built features (server exists, UI missing — or vice versa)

| Feature | State |
|---|---|
| Price-history chart | Endpoint + hook + recharts all present; **no chart rendered anywhere** — a price-comparison app without a price graph |
| Price tracker management | Can create only; no untrack (hook exists), no target-price input (server accepts it), no tracker list |
| Email/password auth | Server routes exist (broken, §2.1); zero client UI |
| Saved comparisons | `POST /api/comparisons/save` exists; no GET/list/delete — write-only |
| Smart links / `/api/go` | Built server-side, never called by client |
| Trust badge on cards | `TrustBadge compact` variant built, unused; `ProductWithPriceRange.trustScore` field never populated |
| Personalization | Interests/skin type/budget collected and stored, never used in any query — despite `products.tags` having matching fields |
| Weekly digest scheduling | No cron; `weekly_digest`/`trending` notification types never created; digest summary computed but not persisted |
| `imageVerifications` table | Never written to |
| `refreshLogs` | Written, never read; 'pending' rows never resolved |

---

## 7. Prioritized roadmap

### P0 — Truth & trust (make the data honest)
1. **Wire the real price pipeline**: deploy `python_fetcher` (or port SerpAPI fetching to Node — simpler on Vercel), call `updateProductPricesFromFetch` on a schedule, fix the `/refresh-prices` contract, and **remove the fabricated "Prices refreshed" success**. Validate merchant domains on SerpAPI results and fix the `extracted_price` → USD currency bug.
2. **Purge fabricated seed content**: fake influencer videos attributed to real people (Rickroll included), invented follower counts, "In Stock" hardcoding, fake "why trending" copy. Where real data isn't available yet, label honestly ("price as of {date}", "video search on YouTube") rather than simulate.
3. **Label LLM-derived data as estimates** (trust score, review counts, articles) or replace with measured sources (Reddit API for mentions, retailer review APIs). Remove the constant-50 engagement component until it has a data feed; make image verification fail-closed.
4. **Fix affiliate links**: real product URLs + affiliate parameters, routed through `/api/go/:offerId` for atomic click tracking.

### P1 — Broken flows & security
5. Fix the onboarding redirect loop (allow `/onboarding?edit=1`), Digest payload contract, Compare grid class, toast dismiss delay.
6. Session auth: either read `session.userId` in middleware or drop email/password entirely; stop returning `passwordHash`.
7. Image proxy: `redirect: 'manual'`, fetch timeout, streamed size cap. Auth-gate analytics; introduce an admin role for refresh/cache endpoints; enable DB TLS verification.
8. Add an async error wrapper (or upgrade to Express 5) so DB errors return 500s instead of hanging.
9. Schedule background jobs for the Vercel deployment (Vercel Cron hitting protected endpoints) — otherwise alerts/digests never run in production.

### P2 — UX polish (highest-leverage first)
10. Error + skeleton states everywhere; optimistic favorite toggle with toast on failure; search debounce + `keepPreviousData`.
11. Price-history sparkline on ProductDetails (all pieces already in the bundle) and "price as of" staleness labels.
12. Price-tracker management UI (target price, untrack, tracker list in Settings).
13. Back-button/history fix, scroll restoration, pull-to-refresh, haptics.
14. Trim fonts to the 2 used families; route-level code splitting; memoize ProductCard.
15. Accessibility pass: remove `maximum-scale=1`, 44px touch targets, real Drawer for the compare sheet, keyboard handling on clickable rows. Define the missing `--card`/`--popover` CSS vars (and either implement dark mode or remove the dead `dark:` classes).

### P3 — Feature bets (further enhancements)
16. **Personalized feed**: use stored preferences against `products.tags` (already modeled) for ranking; rename "Trending" honestly or compute it from click/mention velocity.
17. **Real product ingestion**: retailer product APIs or a scheduled scraper writing to `products`/`productOffers`, replacing the seed; weekly "drop" generation job that actually rotates the catalog.
18. **Wishlist price intelligence**: show current min price + delta since favorited (priceHistory exists); "notify me weekly" digest opt-in with push via Capacitor.
19. **Shareable comparisons** (`/compare?ids=1,2`) using the existing save endpoint.
20. **Honest benchmarks**: extend `script/audit.ts` to actually fetch each curated image URL (status + content-type), verify seeded video IDs resolve, and diff client-rendered fields against server response shapes — the current benchmark only greps source text.

---

## Appendix: verification notes

Spot-verified directly during this review: price multipliers (`routes.ts:2139–2241`), Rickroll seed (`routes.ts:1434`), dead `updateProductPricesFromFetch` (zero call sites), `session.userId` written but never read (`routes.ts:1064, 1090`), toast delay (`use-toast.ts:9`), dynamic grid class (`Compare.tsx:229`), digest payload mismatch (`weeklyDigest.ts:94–98` vs `Digest.tsx:35–121`), onboarding redirect (`Onboarding.tsx:44–48` + `Settings.tsx:72, 78`), proxy redirect-following + post-buffer size check (`routes.ts:646–671`), `passwordHash` on the users table returned by PATCH `/api/user` (`shared/models/auth.ts:19`, `routes.ts:69`). `npx tsc` passes with no errors.
