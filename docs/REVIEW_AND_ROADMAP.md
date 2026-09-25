# Beauty Drop: Code Review and Product Roadmap

_Review date: 2026-09-25 · Branch reviewed: `main` @ 0049f4b_

**The goal:** Beauty Drop should be the one place people go for any new beauty launch. For each product it shows the content about that product, compares prices across sellers, and has an agent that adds the item to your cart on the seller's site (every seller except Amazon), fills in your address, and stops so you can pay yourself. It should be good enough to open every day just for the content. It will ship on the web, iOS and Android, and it should feel effortless: no hunting for buttons.

This document covers:
1. Where the code stands today
2. What to fix before building anything new
3. The target experience
4. Architecture for content, prices and the checkout agent
5. A phased plan

---

## 1. Where the code stands today

**What's already good:**
- A clean stack: React + Vite + TanStack Query + Tailwind/shadcn on the front end, and Express + Drizzle + Postgres on the back end.
- One codebase for web and Android, using Capacitor.
- Product images are handled well. They go through a proxy, and if a photo fails, the app draws its own SVG product card instead (see `BENCHMARKS.md`).
- The data model already has a sensible starting point: offers, price history, price trackers, favorites, notifications, articles, trust scores and review summaries.
- The visual style (pastel rose, Playfair and Inter fonts, rounded cards) is a reasonable base, and `npm run check` passes.

**What doesn't match the product idea yet.** Most of the "intelligence" in the app is placeholder data, which undercuts the trust the product needs:

| Area | Reality today | Where |
|---|---|---|
| Product catalog | 21 hand-written seed products, seeded **only outside production**. `npm run db:seed` doesn't exist, so production starts empty. | `server/routes.ts:1347-2270` |
| Prices | Each seed price is multiplied by fixed factors (0.95, 0.92…) per retailer. "Affiliate URLs" are retailer search pages. | `server/routes.ts:2127-2244` |
| Refresh prices | Calls the Python `/refresh` endpoint and expects `price` back, but that endpoint only returns `{status}`. No price ever changes, yet the call reports success. | `server/routes.ts:383`, `python_fetcher/main.py:142` |
| Price alerts | Run on `setInterval`, which is never started on Vercel. The check copies the price that's already stored, and "target reached" fires again every 6 hours. | `server/services/priceChecker.ts` |
| Videos | Seed data contains placeholder YouTube IDs, Unsplash thumbnails and invented follower counts. | seed data |
| Review summary | gpt-4o answers "from its knowledge" with no real review data, so review counts are invented. | `server/services/reviewSynthesis.ts` |
| Trust score | 30% of the score is always 50, because no engagement metrics are ever passed in. | `server/services/trustScore.ts:240` |
| "In Stock" | Hard-coded text in the UI. | `client/src/pages/ProductDetails.tsx:555` |
| iOS | No `ios/` project. | — |

---

## 2. Fix these first (bugs and security)

These are blockers. Fix them before adding features.

1. **Sign-in is broken in the client.** `useAuth` calls `/api/auth/user`, but `registerAuthRoutes` (`server/auth/routes.ts`) is never called, so the endpoint doesn't exist. The email/password routes set `session.userId`, while every protected route checks `req.user.claims.sub`, so password users are never authenticated.
2. **Native builds can't reach the API.** Every hook calls `fetch('/api/...')` directly (`use-drops.ts`, `use-user.ts`, `use-auth.ts`). Only `queryClient.ts` resolves `VITE_API_BASE_URL`. Inside Capacitor, relative URLs have no backend, and cookie sessions across origins won't work. Route every call through one API client and use bearer tokens on native.
3. **Google blocks OAuth inside a WebView.** Use native Google Sign-In on Android and iOS. On iOS you must also offer **Sign in with Apple**, because the App Store requires it whenever other social logins are offered.
4. **Unhandled async errors crash the process.** Express 4 doesn't catch rejected promises. Wrap handlers (or move to Express 5) and add a central error handler.
5. **The image proxy allows XSS and SSRF.** It serves SVG from `cdn.shopify.com` on your own origin, follows redirects, and buffers the whole body before checking its size. Fix it: accept only raster images, set `redirect: "manual"`, stream the body with a byte cap, and add `X-Content-Type-Options: nosniff` and a strict CSP.
6. **Any logged-in user can trigger costly operations.** `/api/refresh-trending`, `/api/refresh-images`, `/api/cache/invalidate` and `/api/weekly-digest/generate` each spend money on paid AI or data APIs. `/api/analytics/*` is public. Add an admin role and move these operations into background jobs.
7. **CSRF.** The session cookie is `sameSite: "none"` and there are no CSRF tokens. Use `lax`, or add tokens.
8. **Rate limits and cache don't work on serverless.** Both are in memory, so each serverless instance has its own copy. Use Redis/Upstash, or Postgres.
9. **Missing unique constraints**:
   - `favorites(user_id, product_id)`
   - `product_trust_scores(product_id)`
   - `product_review_summaries(product_id)`
   - `product_articles(product_id, url)`
10. **Housekeeping:**
    - Move the ~900 lines of seed data out of `routes.ts`.
    - Split routes by domain.
    - Delete dead code: `client/replit_integrations`, the chat models, `main.py`, `/api/go`, `/api/smart-link`, `imageVerifications`.
    - Add a test runner (Vitest for TypeScript, pytest for the fetcher) and CI that runs `check`, the tests, and `audit:benchmarks`.

---

## 3. The target experience: one product page for everything

The product needs one idea: **every drop is a single screen where the content, the price and the purchase all live**. Users should never have to press "Refresh", "Calculate", "Generate" or "Discover". The app does that work ahead of time.

### 3.1 Remove all the manual buttons
The product page currently has **seven** buttons that start backend work: refresh image, find videos, calculate trust score, generate summary, refresh prices, track price, and refresh trending on the home screen. Each one tells the user the data isn't ready yet. Replace them with:
- **Background jobs** that enrich each product when it's added, then refresh it on a schedule (prices hourly, content daily).
- **Stale-while-revalidate** loading. Always show the last known data with a quiet "Updated 12 min ago" label.
- **Skeleton states** for data that's still being prepared, instead of empty states with buttons.

### 3.2 Home: a daily "Today" feed instead of a static grid
- **Hero card: "Drop of the day".** A full-bleed image or video, a countdown for launches that haven't happened yet, and a best price shown immediately.
- **Stories row.** Tap-through vertical video clips from creators for this week's drops, like Instagram/TikTok stories. This is the daily habit hook.
- **Sections that change every day:**
  - "Just launched"
  - "Coming soon" (with a "Remind me" toggle)
  - "Price dropped since you saved it"
  - "Restocked"
  - "Dupes under ₹999 / $15"
  - "For your skin type"
- Personalize the order using onboarding answers (skin type, tone, budget) and behavior (saves, dwell time, clicks).
- Remove the "Refresh" button from the header. Use pull-to-refresh with haptics.

### 3.3 The product page: one vertical scroll plus a sticky action bar

```
┌─────────────────────────────┐
│ ‹  [media carousel: photos, │  swipe = photos → swatches → videos
│     swatches, videos]  ♡ ⤴  │
├─────────────────────────────┤
│ Brand · Category · ★ Trust  │
│ Product name                │
│ "Why it's trending" chip    │
│ [Shade picker ● ● ● ● ●]    │  shades/variants (new data model)
├─────────────────────────────┤
│ Watch  ─ horizontal reels   │  auto-loaded, plays inline muted
│ Read   ─ article cards      │
│ The verdict (AI, sourced)   │  pros/cons with links to real sources
│ Skin/climate fit for YOU    │  personalised from profile
│ Ingredients & dupes         │
│ Price history sparkline     │
├─────────────────────────────┤
│ ▔▔ sticky bottom bar ▔▔▔▔▔▔ │
│ Best ₹1,249 at Nykaa  [Add to cart ▸] │
│ 4 more sellers ⌃            │  swipe up → full comparison sheet
└─────────────────────────────┘
```

- **Sticky price bar.** The cheapest price and the main action are always within reach of the thumb. Swiping up opens a bottom sheet with every seller, sorted by total cost: price plus shipping, minus coupons, with a delivery ETA and live stock status.
- **"Add to cart" runs the agent.** For Amazon (see §4.3), the same button opens the Amazon cart instead. Progress appears inline as a live card, not on a new page.
- Price alerts become a single bell toggle on the price bar, with an optional target price.
- Use embedded players (YouTube, Instagram and TikTok all offer official embeds) so users don't leave the app just to watch a video.

### 3.4 Navigation: fewer places to go
- Reduce the bottom nav to four tabs: **Today · Explore · Bag · You**.
  - **Bag** holds saved items and agent-prepared carts, grouped by seller.
  - Move Compare, Digest and Notifications into the places users already are. Compare becomes a "Compare with…" action on the product page. The weekly digest becomes a story on the Today feed. Notifications become an inbox badge.
  - **Analytics** is an admin tool and should not be in the consumer app at all.
- Universal search: one search field that accepts products, brands, ingredients, shades, or a pasted product link or screenshot.
- Deep links from push notifications should open the exact product page and scroll to the price bar.

### 3.5 Making it feel delightful
- **Dark mode.** `darkMode: "class"` is configured, but no dark-theme tokens exist.
- **Motion:**
  - Framer Motion shared-element transitions from card to product page.
  - Spring-based bottom sheets (`vaul` is already installed).
  - Haptics on save and add-to-cart (`@capacitor/haptics` is installed but not used).
- **Performance:**
  - `client/index.html` loads about 25 Google font families. It needs two: Playfair Display and Inter.
  - Self-host fonts for the native apps.
  - Split code by route and prefetch the product page when its card becomes visible.
- **Web:** use a responsive layout (two columns on desktop, with the price comparison as a sticky side panel) rather than the current `max-w-md` phone column stretched across the screen. Server-render or pre-render product pages so they can be shared and found in search (SEO) and carry Open Graph cards.
- **Accessibility:** keep the existing audit, and add Dynamic Type support and minimum 44pt tap targets.

---

## 4. Architecture for the three pillars

### 4.1 Content engine (the reason to come back daily)
**New tables:**
- `content_items(id, type[video|article|tutorial|swatch|review|news], platform, external_id, url, creator_id, title, thumbnail, published_at, language, country, status[pending|approved|rejected], dedupe_hash)`
- `product_content(product_id, content_item_id, relevance_score)`
- `creators`

**Sources:**
- YouTube Data API, TikTok Research/Display API, Instagram oEmbed/Graph
- Reddit API
- Brand RSS feeds and press releases
- Google News / SerpAPI News

Use an LLM only to *classify and summarize* content that has already been fetched, never to *invent* it. Every AI claim should link to its sources.

**Launch detection:** watch brand Shopify `products.json` feeds and retailer "new arrivals" pages to find drops automatically, and store `launch_date` so the app can show countdowns.

**Jobs:** use a real queue and scheduler, for example Inngest, Trigger.dev, QStash, or Vercel Cron plus a Postgres queue. Don't use `setInterval`, and don't trigger these from the user's side.

### 4.2 Multi-seller price comparison
**Model:**
- `brands`
- `products` (one canonical product, with no country field)
- `variants` (shade and size, with GTIN/EAN)
- `listings` (variant × retailer, with the seller URL, SKU, and marketplace seller name)
- `offer_snapshots` (listing, price in **integer minor units**, list price, shipping, stock status, coupon, source, observed_at)

Price history is then a query over snapshots, and the same product can be sold in India and the US without duplicate rows.

**Where prices come from, in order of preference:**
1. **Affiliate and retailer feeds.** Impact, CJ, Rakuten, Awin, Admitad and Cuelinks carry most US and India beauty retailers. These give legal prices, stock status and deep links.
2. **Shopify storefront JSON** for brands that sell directly (`/products/<handle>.json`).
3. **SerpAPI Google Shopping** (the Python fetcher already does this). Deploy it as a separate service, protect it with auth, and have it *return* prices.
4. **Headless scraping** only as a last resort, per retailer, while respecting robots.txt and the retailer's terms.

**Matching:** match listings to variants by GTIN first, then by fuzzy brand/name/shade matching with an LLM verifying the match. Record a confidence score, and hide matches with low confidence.

### 4.3 The checkout agent ("add to cart and stop before payment")
This is the feature that sets the product apart, and the one with the most risk. Recommended design:

**Pick the cheapest reliable method for each retailer:**

| Tier | Method | Examples |
|---|---|---|
| A | **Cart permalink or API.** No browser needed, instant, and robust. | Shopify DTC brands (`/cart/<variant_id>:<qty>`); retailers with partner cart APIs |
| B | **Browser agent** (Playwright plus a computer-use-capable LLM) running in a cloud browser (Browserbase/Steel/Anchor), with scripted steps per retailer and the LLM as a fallback for layout changes | Nykaa, Sephora, Ulta, Tira, Purplle |
| C | **Handoff.** Open the retailer's page with the product preselected. | Retailers that block automation |
| Amazon | **Not automated** (Amazon's terms forbid it). Use an affiliate link or Amazon Associates' add-to-cart URL instead (check that the current Associates policy still allows it). | Amazon |

**Flow, as a state machine** (`agent_jobs` plus `agent_steps` tables):
`queued → opening_site → signing_in → adding_item → verifying_price → entering_address → ready_for_payment → handed_off | failed | cancelled`

- **The hard stop before payment is enforced in code**, not just by the prompt. The runner refuses to act on any element that looks like payment or order submission (for example "Place order", "Pay", or card fields).
- **Handing off to the user:**
  - *Web:* show a live view of the browser session so the user completes payment in the same session.
  - *Mobile:* many sites don't let you move a session to another device. So either the user completes payment inside an in-app browser that carries over the agent's cookies, or the agent works in the user's **own** signed-in session in a native in-app WebView on the device. The second option is more reliable for login, 2FA and CAPTCHAs.
  - Prototype both options early; this decides the architecture.
- **Credentials:** never store retailer passwords in plain text. Prefer a session the user signs in to themselves, or use an encrypted vault (KMS) with per-retailer consent that the user can revoke.
- **Addresses:**
  - `user_addresses` with encrypted personal data.
  - Validate addresses: Indian PIN codes, and USPS/Smarty in the US.
- **Trust UI:**
  - Show a live step list with screenshots.
  - Show the final cart and total, and flag any difference from the quoted price.
  - Offer a one-tap "cancel and clear cart".
- **Audit and compliance:**
  - Log every action the agent takes in an append-only log.
  - Store consent records.
  - Review each retailer's terms and affiliate agreement before turning on tier B.
  - Tier A plus affiliate deep links will likely cover most volume at launch with little risk.

---

## 5. Mobile strategy
- **Keep Capacitor for now.** It's the fastest way to get web, iOS and Android from one codebase. Add the iOS project with `npx cap add ios`.
- **Native pieces you'll need:**
  - Push notifications (FCM/APNs)
  - Native Google and Apple sign-in
  - Secure storage for tokens
  - The in-app browser for the checkout handoff
  - Share-sheet intake ("Share to Beauty Drop" from Instagram or TikTok opens the product)
  - Haptics
- **Hardening:**
  - Turn off `cleartext` and `allowMixedContent` in release builds.
  - Set `server.url` or `VITE_API_BASE_URL` for each environment.
- **When to reconsider:** if the video feed needs TikTok-grade smoothness later, rebuild that one screen natively, or move to Expo/React Native. The API and design tokens carry over either way.

---

## 6. Phased plan

| Phase | Scope | Outcome |
|---|---|---|
| **0. Stabilize** (1–2 wks) | §2 fixes; one API client; admin role; real job runner; remove fake videos, prices and "In Stock"; tests + CI | Honest, secure foundation |
| **1. Real data** (3–4 wks) | brands/variants/listings/snapshots model; affiliate feeds + SerpAPI service; content ingestion with source links; launch detection | Real prices and content without any buttons |
| **2. Experience** (3–4 wks) | Today feed + stories; single-scroll product page + sticky price bar + comparison sheet; 4-tab nav; dark mode; haptics; push; iOS build | The "don't hunt for buttons" experience |
| **3. Agent v1** (4–6 wks) | Tier A cart permalinks (Shopify DTC) + Amazon affiliate cart; addresses; agent job state machine + audit log + trust UI | "Add to cart" works for the easiest-to-integrate retailers |
| **4. Agent v2** | Tier B browser agent for 2–3 India/US retailers; mobile payment handoff; retry and monitoring | Full agentic checkout |

**Metrics to track:**
- DAU/MAU, and sessions per day driven by the content feed
- How often users open the price comparison sheet, and how often they tap "Add to cart"
- Agent success rate, how often the cart price differs from the quoted price, and time until the cart is ready for payment
- Affiliate revenue per daily active user
