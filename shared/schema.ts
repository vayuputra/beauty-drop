import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

export * from "./models/auth";

export const retailers = pgTable("retailers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(), // 'IN' or 'US'
  logoUrl: text("logo_url"),
  // Storefront host, e.g. "www.nykaa.com" or a brand's own "rarebeauty.com".
  domain: text("domain"),
  // "retailer" (multi-brand store / marketplace) or "brand" (the brand's own store).
  kind: text("kind").notNull().default("retailer"),
});

/**
 * Brand-owned storefronts we watch for new launches. Today only Shopify stores
 * are supported (their public /products.json feed lists products with launch dates).
 */
export const brandSources = pgTable("brand_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  platform: text("platform").notNull().default("shopify"),
  country: text("country").notNull(), // market the store sells to: 'IN' or 'US'
  currency: text("currency").notNull(), // 'INR' or 'USD'
  active: boolean("active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_brand_sources_domain").on(table.domain),
]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  category: text("category").notNull(),
  country: text("country").notNull(), // 'IN' or 'US'
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  whyTrending: text("why_trending"),
  tags: jsonb("tags").$type<{
    priceBand?: string;
    skinType?: string;
    finish?: string;
    concern?: string;
  }>(),
  influencerCount: integer("influencer_count").default(0),
  lastInfluencerRefresh: timestamp("last_influencer_refresh"),
  // Stable identity in the source that created the product, e.g. "shopify:rarebeauty.com:8123".
  sourceKey: text("source_key"),
  brandSourceId: integer("brand_source_id").references(() => brandSources.id),
  // Canonical product page on the brand's site.
  productUrl: text("product_url"),
  // When the product went on sale (the brand's publish date), used for "new drop" ordering.
  launchedAt: timestamp("launched_at"),
  lastPriceCheckAt: timestamp("last_price_check_at"),
  lastContentCheckAt: timestamp("last_content_check_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_products_source_key").on(table.sourceKey),
  index("idx_products_launched").on(table.launchedAt),
  index("idx_products_country").on(table.country),
  index("idx_products_category").on(table.category),
  index("idx_products_brand").on(table.brand),
]);

export const productOffers = pgTable("product_offers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  retailerId: integer("retailer_id").notNull().references(() => retailers.id),
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull(), // 'INR' or 'USD'
  affiliateUrl: text("affiliate_url").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  // Where the price came from: "brand_site", "google_shopping", "manual" or "demo" (placeholder).
  source: text("source").notNull().default("demo"),
  // Regular price when the offer is discounted (shown struck through).
  listPrice: doublePrecision("list_price"),
  // null = unknown.
  inStock: boolean("in_stock"),
}, (table) => [
  uniqueIndex("uq_offers_product_retailer").on(table.productId, table.retailerId),
]);

/** Shades / sizes. Variant ids also power cart permalinks for the checkout agent later. */
export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  sku: text("sku"),
  gtin: text("gtin"),
  price: doublePrecision("price"),
  listPrice: doublePrecision("list_price"),
  available: boolean("available"),
  imageUrl: text("image_url"),
  position: integer("position").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_variants_product_external").on(table.productId, table.externalId),
]);

/** One row per scheduled/background job run, for observability. */
export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(), // "launches" | "prices" | "content"
  status: text("status").notNull(), // "running" | "success" | "partial" | "failed"
  stats: jsonb("stats").$type<Record<string, number>>(),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
}, (table) => [
  index("idx_ingestion_runs_job").on(table.job, table.startedAt),
]);

export const productVideos = pgTable("product_videos", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  platform: text("platform").notNull(), // 'youtube', 'instagram', 'tiktok'
  title: text("title"),
  thumbnailUrl: text("thumbnail_url"),
  videoUrl: text("video_url").notNull(),
  embedUrl: text("embed_url"), // Embeddable URL for iframe
  creatorName: text("creator_name"), // Influencer name
  creatorHandle: text("creator_handle"), // @handle
  creatorFollowers: text("creator_followers"), // e.g. "2.5M"
  // Platform id (YouTube video id). Present for videos fetched from a platform API.
  externalId: text("external_id"),
  channelId: text("channel_id"),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_videos_product_platform_external").on(table.productId, table.platform, table.externalId),
]);

export const clicks = pgTable("clicks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  productId: integer("product_id").references(() => products.id),
  retailerId: integer("retailer_id").references(() => retailers.id),
  clickedAt: timestamp("clicked_at").defaultNow(),
}, (table) => [
  index("idx_clicks_product").on(table.productId),
  index("idx_clicks_retailer").on(table.retailerId),
  index("idx_clicks_date").on(table.clickedAt),
]);

export const influencerMentions = pgTable("influencer_mentions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  handle: text("handle").notNull(),
  platform: text("platform").notNull(), // 'youtube', 'instagram', 'tiktok', 'reddit'
  followers: text("followers"),
  videoUrl: text("video_url"),
  videoTitle: text("video_title"),
  thumbnailUrl: text("thumbnail_url"),
  embedUrl: text("embed_url"),
  discoveredAt: timestamp("discovered_at").defaultNow(),
}, (table) => [
  index("idx_influencer_product").on(table.productId),
  index("idx_influencer_discovered").on(table.discoveredAt),
]);

export const refreshLogs = pgTable("refresh_logs", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id),
  refreshType: text("refresh_type").notNull(), // 'influencers', 'image', 'all'
  status: text("status").notNull(), // 'success', 'failed', 'pending'
  message: text("message"),
  refreshedAt: timestamp("refreshed_at").defaultNow(),
});

// Trust Score tracking per product
export const productTrustScores = pgTable("product_trust_scores", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  trustScore: integer("trust_score").notNull(), // 1-100
  redditSentimentScore: integer("reddit_sentiment_score"), // 0-100
  engagementAuthenticityScore: integer("engagement_authenticity_score"), // 0-100
  redditMentions: integer("reddit_mentions").default(0),
  redditSources: jsonb("reddit_sources").$type<string[]>(),
  lastCalculated: timestamp("last_calculated").defaultNow(),
}, (table) => [
  uniqueIndex("uq_trust_scores_product").on(table.productId),
]);

// AI-generated review summaries
export const productReviewSummaries = pgTable("product_review_summaries", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  summaryText: text("summary_text").notNull(),
  climateSuitability: text("climate_suitability"), // e.g., "Best for Delhi winters"
  skinTypeMatch: text("skin_type_match"), // e.g., "Oily to combination skin"
  prosHighlights: jsonb("pros_highlights").$type<string[]>(),
  consHighlights: jsonb("cons_highlights").$type<string[]>(),
  sources: jsonb("sources").$type<{ platform: string; reviewCount: number }[]>(),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_review_summaries_product").on(table.productId),
]);

// Price tracking for user alerts
export const priceTrackers = pgTable("price_trackers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull().references(() => products.id),
  targetPrice: doublePrecision("target_price"),
  notifyOnAnyDrop: boolean("notify_on_any_drop").default(true),
  isActive: boolean("is_active").default(true),
  // Best price when tracking started; "any drop" alerts fire below the lower of this and lastNotifiedPrice.
  baselinePrice: doublePrecision("baseline_price"),
  lastNotifiedPrice: doublePrecision("last_notified_price"),
  lastNotifiedAt: timestamp("last_notified_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_price_trackers_user_product").on(table.userId, table.productId),
]);

// Price history for tracking volatility
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  retailerId: integer("retailer_id").notNull().references(() => retailers.id),
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull(),
  source: text("source"),
  observedAt: timestamp("observed_at").defaultNow(),
});

// Weekly digest data
export const weeklyDigests = pgTable("weekly_digests", {
  id: serial("id").primaryKey(),
  weekStartDate: timestamp("week_start_date").notNull(),
  topProducts: jsonb("top_products").$type<{
    productId: number;
    name: string;
    reason: string; // 'price_volatility' | 'social_mentions'
    change: number; // percentage or count
  }[]>(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

// Image verification results
export const imageVerifications = pgTable("image_verifications", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  imageUrl: text("image_url").notNull(),
  isVerified: boolean("is_verified"),
  confidence: doublePrecision("confidence"), // 0-1
  mismatchReason: text("mismatch_reason"),
  verifiedAt: timestamp("verified_at").defaultNow(),
});

// User favorites / wishlist
export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull().references(() => products.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_favorites_user").on(table.userId),
  uniqueIndex("uq_favorites_user_product").on(table.userId, table.productId),
]);

// In-app notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'price_drop', 'target_reached', 'weekly_digest', 'trending'
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data").$type<Record<string, any>>(), // extra context (productId, etc.)
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_notifications_user").on(table.userId),
  index("idx_notifications_read").on(table.userId, table.isRead),
]);

// Cached articles for products
export const productArticles = pgTable("product_articles", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  source: text("source"), // e.g., 'Vogue', 'Allure', 'beauty blog'
  snippet: text("snippet"),
  publishedAt: text("published_at"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
}, (table) => [
  index("idx_articles_product").on(table.productId),
  uniqueIndex("uq_articles_product_url").on(table.productId, table.url),
]);

// Product comparison lists
export const comparisons = pgTable("comparisons", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  productIds: jsonb("product_ids").$type<number[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const productRelations = relations(products, ({ one, many }) => ({
  offers: many(productOffers),
  variants: many(productVariants),
  videos: many(productVideos),
  influencers: many(influencerMentions),
  trustScore: one(productTrustScores),
  reviewSummary: one(productReviewSummaries),
}));

export const trustScoreRelations = relations(productTrustScores, ({ one }) => ({
  product: one(products, {
    fields: [productTrustScores.productId],
    references: [products.id],
  }),
}));

export const reviewSummaryRelations = relations(productReviewSummaries, ({ one }) => ({
  product: one(products, {
    fields: [productReviewSummaries.productId],
    references: [products.id],
  }),
}));

export const priceTrackerRelations = relations(priceTrackers, ({ one }) => ({
  user: one(users, {
    fields: [priceTrackers.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [priceTrackers.productId],
    references: [products.id],
  }),
}));

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  product: one(products, {
    fields: [priceHistory.productId],
    references: [products.id],
  }),
  retailer: one(retailers, {
    fields: [priceHistory.retailerId],
    references: [retailers.id],
  }),
}));

export const influencerMentionRelations = relations(influencerMentions, ({ one }) => ({
  product: one(products, {
    fields: [influencerMentions.productId],
    references: [products.id],
  }),
}));

export const offerRelations = relations(productOffers, ({ one }) => ({
  product: one(products, {
    fields: [productOffers.productId],
    references: [products.id],
  }),
  retailer: one(retailers, {
    fields: [productOffers.retailerId],
    references: [retailers.id],
  }),
}));

export const variantRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const videoRelations = relations(productVideos, ({ one }) => ({
  product: one(products, {
    fields: [productVideos.productId],
    references: [products.id],
  }),
}));

export const favoriteRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [favorites.productId],
    references: [products.id],
  }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  country: true,
  preferences: true,
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertRetailerSchema = createInsertSchema(retailers).omit({ id: true });
export const insertOfferSchema = createInsertSchema(productOffers).omit({ id: true, lastUpdated: true });
export const insertVideoSchema = createInsertSchema(productVideos).omit({ id: true });
export const insertClickSchema = createInsertSchema(clicks).omit({ id: true, clickedAt: true });
export const insertTrustScoreSchema = createInsertSchema(productTrustScores).omit({ id: true, lastCalculated: true });
export const insertReviewSummarySchema = createInsertSchema(productReviewSummaries).omit({ id: true, generatedAt: true });
export const insertPriceTrackerSchema = createInsertSchema(priceTrackers).omit({ id: true, createdAt: true, lastNotifiedAt: true });
export const insertPriceHistorySchema = createInsertSchema(priceHistory).omit({ id: true, observedAt: true });

// Types
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Retailer = typeof retailers.$inferSelect;
export type ProductOffer = typeof productOffers.$inferSelect;
export type ProductVideo = typeof productVideos.$inferSelect;
export type InfluencerMention = typeof influencerMentions.$inferSelect;
export type ProductTrustScore = typeof productTrustScores.$inferSelect;
export type ProductReviewSummary = typeof productReviewSummaries.$inferSelect;
export type PriceTracker = typeof priceTrackers.$inferSelect;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type WeeklyDigest = typeof weeklyDigests.$inferSelect;
export type ImageVerification = typeof imageVerifications.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ProductArticle = typeof productArticles.$inferSelect;
export type Comparison = typeof comparisons.$inferSelect;
export type BrandSource = typeof brandSources.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type IngestionRun = typeof ingestionRuns.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertRetailer = z.infer<typeof insertRetailerSchema>;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertClick = z.infer<typeof insertClickSchema>;
export type InsertTrustScore = z.infer<typeof insertTrustScoreSchema>;
export type InsertReviewSummary = z.infer<typeof insertReviewSummarySchema>;
export type InsertPriceTracker = z.infer<typeof insertPriceTrackerSchema>;
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;

export type ProductWithDetails = Product & {
  offers: (ProductOffer & { retailer: Retailer })[];
  variants: ProductVariant[];
  videos: ProductVideo[];
  influencers: InfluencerMention[];
  trustScore?: ProductTrustScore | null;
  reviewSummary?: ProductReviewSummary | null;
};

export type ProductWithPriceRange = Product & {
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  /** Every known offer is sold out. */
  soldOut?: boolean;
  trustScore?: number | null;
};

export type UpdateUserRequest = Partial<InsertUser>;
