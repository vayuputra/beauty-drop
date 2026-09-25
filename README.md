# Beauty Drop

Beauty Drop is a mobile-first web app that delivers weekly curated "drops" of trending makeup and beauty products to users in India and the US. Users discover products through personalized recommendations, embedded creator videos, and price comparisons across retailers; all purchases redirect to retailers via affiliate links.

## Features

- Weekly curated product drops, personalized by country, interests, and budget
- Price comparison across retailers (Nykaa, Amazon, Sephora, Ulta, …)
- Embedded creator/review videos from YouTube, Instagram, and TikTok
- Affiliate click tracking and analytics
- Trust Score Engine (Reddit sentiment + engagement authenticity)
- AI review synthesis with climate and skin-type matching (GPT-4o)
- Price tracking with user-set alerts and 6-hour background checks
- Weekly digest with price volatility and social mention tracking
- Deep linking to native retailer apps via Android intents and iOS universal links
- iOS and Android builds via Capacitor

## Tech Stack

- **Frontend:** React 18 + TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui (Radix), Framer Motion
- **Backend:** Node.js + Express, TypeScript (ESM), Zod
- **Auth:** Google sign-in (OpenID Connect) and email/password via Passport.js, PostgreSQL session store
- **Database:** PostgreSQL with Drizzle ORM (`shared/schema.ts`)
- **AI:** OpenAI GPT-4o (review synthesis + image verification), Perplexity (influencer discovery)
- **Mobile:** Capacitor for iOS and Android

## Project Structure

```
beauty-drop/
├── client/          # React frontend
├── server/          # Express API
├── shared/          # Shared schema (Drizzle + Zod)
├── android/         # Capacitor Android project
├── python_fetcher/  # Auxiliary data fetcher
├── script/          # Build scripts
└── drizzle.config.ts
```

## Running Locally

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL at minimum
npm run db:push           # apply schema to DATABASE_URL
npm run dev               # start dev server (Vite + Express); seeds demo products into an empty DB
```

Google sign-in is optional locally. Without `GOOGLE_CLIENT_ID` the server logs a warning and
email/password sign-in still works. `npm run db:seed` loads the demo catalog on its own. The demo
prices are placeholders and are shown as "Price not yet verified".

### Environment variables

See `.env.example`. The important ones:

- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: 32+ characters; required in production
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_CALLBACK_URL`: Google sign-in (required in production)
- `ADMIN_EMAILS`: operator accounts allowed to run bulk refreshes, analytics and cache control
- `CRON_SECRET`: protects `/api/cron/price-check`, which Vercel Cron calls to send price alerts
- `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`: AI features (the app runs without them; only those features fail)
- `PYTHON_FETCHER_URL`, `PRICE_FETCHER_TOKEN`: live price service (unset means "live prices not available")
- `VITE_API_BASE_URL`: native builds only; the deployed API origin

### Upgrading an existing database

This release adds unique constraints. Run the dedupe script once, before pushing the schema:

```bash
psql "$DATABASE_URL" -f script/sql/dedupe-before-unique-indexes.sql
npm run db:push
```

## Live data

Three background jobs fill the catalog with real data. Each runs in short, time-boxed batches
so it fits in one serverless call:

| Job | Source | Needs |
|---|---|---|
| `launches` | Brand-owned Shopify stores (`/products.json`): new products, shades, official prices and stock | nothing; add stores on the admin page |
| `prices` | Google Shopping via SerpAPI: prices at other sellers | `SERPAPI_KEY` |
| `content` | YouTube Data API: creator review videos | `YOUTUBE_API_KEY` |

Operators (`ADMIN_EMAILS`) manage the watched brand stores, run jobs and see each run's result at
**Profile → Data & ingestion** (`/admin`).

**Scheduling.** Vercel Hobby allows one daily cron, which calls `/api/cron/daily` (a slice of every
job, then price alerts). For hourly updates, `.github/workflows/scheduled-jobs.yml` calls
`/api/cron/ingest/:job`. To turn it on, set the repository variable `APP_URL` and the secret
`CRON_SECRET`.

## Testing

```bash
npm run check              # typecheck
npm test                   # unit tests; API integration tests also run when DATABASE_URL is set
npm run audit:benchmarks   # image-integrity and UX benchmarks
```

Integration tests write to the database, so point `DATABASE_URL` at a disposable one. CI
(`.github/workflows/ci.yml`) runs all of the above against a throwaway Postgres.

## Building

```bash
npm run build              # static client + server bundle
npm run android:build      # Vite build + Capacitor sync
npm run android:open       # open in Android Studio
npm run ios:build          # Vite build + Capacitor sync (iOS)
npm run ios:open           # open in Xcode (macOS only)
```

Native builds bundle the web app and call the API at `VITE_API_BASE_URL`. To point a device at
a local dev server instead, sync with `CAP_DEV=1 CAP_SERVER_URL=http://<your-ip>:5000`. Only dev
builds allow plain HTTP.

## License

MIT.
