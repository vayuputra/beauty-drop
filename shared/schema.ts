import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision, varchar } from "drizzle-orm/pg-core";
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
});

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
  createdAt: timestamp("created_at").defaultNow(),
});

export const productOffers = pgTable("product_offers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  retailerId: integer("retailer_id").notNull().references(() => retailers.id),
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull(), // 'INR' or 'USD'
  affiliateUrl: text("affiliate_url").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

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
});

export const clicks = pgTable("clicks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  productId: integer("product_id").references(() => products.id),
  retailerId: integer("retailer_id").references(() => retailers.id),
  clickedAt: timestamp("clicked_at").defaultNow(),
});

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
});

export const refreshLogs = pgTable("refresh_logs", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id),
  refreshType: text("refresh_type").notNull(), // 'influencers', 'image', 'all'
  status: text("status").notNull(), // 'success', 'failed', 'pending'
  message: text("message"),
  refreshedAt: timestamp("refreshed_at").defaultNow(),
});

// Relations
export const productRelations = relations(products, ({ one, many }) => ({
  offers: many(productOffers),
  videos: many(productVideos),
  influencers: many(influencerMentions),
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

export const videoRelations = relations(productVideos, ({ one }) => ({
  product: one(products, {
    fields: [productVideos.productId],
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

// Types
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Retailer = typeof retailers.$inferSelect;
export type ProductOffer = typeof productOffers.$inferSelect;
export type ProductVideo = typeof productVideos.$inferSelect;
export type InfluencerMention = typeof influencerMentions.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertRetailer = z.infer<typeof insertRetailerSchema>;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertClick = z.infer<typeof insertClickSchema>;

export type ProductWithDetails = Product & {
  offers: (ProductOffer & { retailer: Retailer })[];
  videos: ProductVideo[];
  influencers: InfluencerMention[];
};

export type ProductWithPriceRange = Product & {
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
};

export type UpdateUserRequest = Partial<InsertUser>;
