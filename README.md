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
- Android build via Capacitor

## Tech Stack

- **Frontend:** React 18 + TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui (Radix), Framer Motion
- **Backend:** Node.js + Express, TypeScript (ESM), Zod
- **Auth:** Replit Auth (OpenID Connect) via Passport.js, PostgreSQL session store
- **Database:** PostgreSQL with Drizzle ORM (`shared/schema.ts`)
- **AI:** OpenAI GPT-4o (review synthesis + image verification), Perplexity (influencer discovery)
- **Mobile:** Capacitor for Android packaging

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
npm run db:push   # apply schema to DATABASE_URL
npm run dev       # start dev server (Vite + Express)
```

### Required Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET`, `ISSUER_URL`, `REPL_ID` — Replit Auth
- `OPENAI_API_KEY`, `PERPLEXITY_API_KEY` — AI features

## Building

```bash
npm run build              # static client + server bundle
npm run android:build      # Vite build + Capacitor sync
npm run android:open       # open in Android Studio
```

## License

MIT.
