# Beauty Drop - Mobile Beauty Product Discovery App

## Overview

Beauty Drop is a mobile-first web application that delivers weekly curated "drops" of trending makeup and beauty products to users in India and the US. The app is an affiliate-based platform where users discover products through personalized recommendations, embedded creator videos, and price comparisons across multiple retailers. All purchases redirect to external retailers via affiliate links.

Key features:
- Weekly curated product drops personalized by country, interests, and preferences
- Price comparison across retailers (Nykaa, Amazon, Sephora, Ulta, etc.)
- Embedded creator/review videos from YouTube, Instagram, TikTok
- Affiliate link tracking and click analytics
- User onboarding with country selection and beauty preferences

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, built with Vite
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **Styling**: Tailwind CSS with custom pink/rose theme optimized for beauty shoppers
- **UI Components**: shadcn/ui component library (New York style) with Radix UI primitives
- **Animations**: Framer Motion for smooth page transitions and micro-interactions
- **Design**: Mobile-first responsive design with bottom navigation pattern

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES Modules)
- **API Pattern**: RESTful JSON API with Zod validation on shared route definitions
- **Authentication**: Replit Auth (OpenID Connect) with Passport.js session management
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple

### Data Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema-to-validation integration
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Migrations**: Managed via `drizzle-kit push`

### Key Data Models
- **Users**: Auth identity plus country and beauty preferences (interests, budget, skin type)
- **Products**: Beauty products with brand, category, country, tags, and trending info
- **Retailers**: Store information by country (Nykaa, Amazon, Sephora, etc.)
- **ProductOffers**: Price/affiliate link per product-retailer combination
- **ProductVideos**: Embedded video links from creator platforms
- **Clicks**: Analytics tracking for affiliate link clicks

### Build System
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: Vite builds static assets to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **Scripts**: `npm run dev` (development), `npm run build` (production build), `npm start` (production server)

## External Dependencies

### Database
- PostgreSQL database (required, connection via `DATABASE_URL` environment variable)
- Session table `sessions` and user table `users` are mandatory for Replit Auth

### Authentication
- Replit OpenID Connect authentication (`ISSUER_URL`, `REPL_ID`, `SESSION_SECRET` environment variables)
- Social login handled via Replit's OAuth flow

### Third-Party Services (Planned/Referenced)
- **Affiliate Networks**: Amazon Associates, Nykaa Affiliate, Sephora, Ulta affiliate programs
- **Video Platforms**: YouTube, Instagram, TikTok embeds for creator content
- **Retailers by Region**:
  - India: Nykaa, Amazon India, Myntra, Ajio
  - US: Amazon US, Sephora, Ulta

### Key NPM Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM and validation
- `@tanstack/react-query`: Server state management
- `framer-motion`: Animations
- `wouter`: Client routing
- `passport` / `express-session`: Authentication middleware
- `zod`: Runtime validation