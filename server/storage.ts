import { db } from "./db";
import {
  users, products, retailers, productOffers, productVideos, clicks, influencerMentions,
  productTrustScores, productReviewSummaries, priceTrackers, priceHistory,
  type User, type InsertUser, type UpdateUserRequest,
  type Product, type ProductWithDetails, type ProductWithPriceRange, type InsertClick, type InfluencerMention,
  type ProductTrustScore, type InsertTrustScore, type ProductReviewSummary, type InsertReviewSummary,
  type PriceTracker, type InsertPriceTracker, type PriceHistory, type InsertPriceHistory
} from "@shared/schema";
import { eq, gt, desc, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // User
  getUser(id: string): Promise<User | undefined>;
  updateUser(id: string, updates: UpdateUserRequest): Promise<User>;

  // Products & Drops
  getProductsByCountry(country: string): Promise<Product[]>;
  getTrendingProductsByCountry(country: string): Promise<ProductWithPriceRange[]>; // Only products with influencer mentions
  getProduct(id: number): Promise<ProductWithDetails | undefined>;
  getAllProducts(): Promise<Product[]>;
  updateProductImage(productId: number, imageUrl: string): Promise<void>;
  updateProductInfluencerCount(productId: number, count: number): Promise<void>;
  
  // Influencers
  getInfluencersForProduct(productId: number): Promise<InfluencerMention[]>;
  addInfluencerMention(productId: number, influencer: Omit<InfluencerMention, 'id' | 'productId' | 'discoveredAt'>): Promise<void>;
  clearInfluencersForProduct(productId: number): Promise<void>;
  
  // Analytics
  trackClick(click: InsertClick): Promise<void>;
  
  // Trust Scores
  getTrustScore(productId: number): Promise<ProductTrustScore | undefined>;
  upsertTrustScore(trustScore: InsertTrustScore): Promise<ProductTrustScore>;
  
  // Review Summaries
  getReviewSummary(productId: number): Promise<ProductReviewSummary | undefined>;
  upsertReviewSummary(summary: InsertReviewSummary): Promise<ProductReviewSummary>;
  
  // Price Tracking
  getPriceTracker(userId: string, productId: number): Promise<PriceTracker | undefined>;
  getUserPriceTrackers(userId: string): Promise<PriceTracker[]>;
  createPriceTracker(tracker: InsertPriceTracker): Promise<PriceTracker>;
  updatePriceTracker(id: number, updates: Partial<InsertPriceTracker>): Promise<PriceTracker>;
  deletePriceTracker(id: number): Promise<void>;
  
  // Price History
  addPriceHistory(entry: InsertPriceHistory): Promise<void>;
  getPriceHistory(productId: number, limit?: number): Promise<PriceHistory[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, updates: UpdateUserRequest): Promise<User> {
    // Use Drizzle upsert with onConflictDoUpdate for proper handling
    const prefs = updates.preferences as {
      interests: string[];
      budget: string;
      skinType?: string;
      skinTone?: string;
    } | undefined;
    
    const [user] = await db.insert(users)
      .values({
        id,
        country: updates.country,
        preferences: prefs,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          country: updates.country,
          preferences: prefs,
          updatedAt: new Date()
        }
      })
      .returning();
    return user;
  }

  async getProductsByCountry(country: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.country, country));
  }

  async getTrendingProductsByCountry(country: string): Promise<ProductWithPriceRange[]> {
    // Return all products for the country with price ranges, sorted by influencer count (trending first)
    const productList = await db
      .select()
      .from(products)
      .where(eq(products.country, country))
      .orderBy(desc(products.influencerCount), desc(products.lastInfluencerRefresh));

    if (productList.length === 0) return [];

    // Fetch all offers for these products in a single query instead of N+1
    const productIds = productList.map(p => p.id);
    const allOffers = await db
      .select()
      .from(productOffers)
      .where(inArray(productOffers.productId, productIds));

    // Group offers by product ID
    const offersByProductId = new Map<number, typeof allOffers>();
    for (const offer of allOffers) {
      const existing = offersByProductId.get(offer.productId) || [];
      existing.push(offer);
      offersByProductId.set(offer.productId, existing);
    }

    return productList.map((product) => {
      const offers = offersByProductId.get(product.id) || [];
      if (offers.length === 0) {
        return { ...product, minPrice: null, maxPrice: null, currency: null };
      }
      const prices = offers.map(o => o.price);
      return {
        ...product,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        currency: offers[0].currency,
      };
    });
  }

  async getProduct(id: number): Promise<ProductWithDetails | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) return undefined;

    const offers = await db.query.productOffers.findMany({
      where: eq(productOffers.productId, id),
      with: {
        retailer: true
      }
    });

    const videos = await db.select().from(productVideos).where(eq(productVideos.productId, id));
    
    const influencers = await db.select().from(influencerMentions).where(eq(influencerMentions.productId, id));

    return {
      ...product,
      offers,
      videos,
      influencers
    };
  }

  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products);
  }

  async updateProductImage(productId: number, imageUrl: string): Promise<void> {
    await db.update(products).set({ imageUrl }).where(eq(products.id, productId));
  }

  async updateProductInfluencerCount(productId: number, count: number): Promise<void> {
    await db.update(products).set({ 
      influencerCount: count,
      lastInfluencerRefresh: new Date()
    }).where(eq(products.id, productId));
  }

  async getInfluencersForProduct(productId: number): Promise<InfluencerMention[]> {
    return await db.select().from(influencerMentions).where(eq(influencerMentions.productId, productId));
  }

  async addInfluencerMention(productId: number, influencer: Omit<InfluencerMention, 'id' | 'productId' | 'discoveredAt'>): Promise<void> {
    await db.insert(influencerMentions).values({
      productId,
      name: influencer.name,
      handle: influencer.handle,
      platform: influencer.platform,
      followers: influencer.followers,
      videoUrl: influencer.videoUrl,
      videoTitle: influencer.videoTitle,
      thumbnailUrl: influencer.thumbnailUrl,
      embedUrl: influencer.embedUrl
    });
  }

  async clearInfluencersForProduct(productId: number): Promise<void> {
    await db.delete(influencerMentions).where(eq(influencerMentions.productId, productId));
  }

  async trackClick(click: InsertClick): Promise<void> {
    await db.insert(clicks).values(click);
  }

  async getTrustScore(productId: number): Promise<ProductTrustScore | undefined> {
    const [score] = await db.select().from(productTrustScores).where(eq(productTrustScores.productId, productId));
    return score;
  }

  async upsertTrustScore(trustScore: InsertTrustScore): Promise<ProductTrustScore> {
    const existing = await this.getTrustScore(trustScore.productId);
    if (existing) {
      const [updated] = await db.update(productTrustScores)
        .set({
          ...trustScore,
          lastCalculated: new Date()
        })
        .where(eq(productTrustScores.productId, trustScore.productId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(productTrustScores).values(trustScore).returning();
    return created;
  }

  async getReviewSummary(productId: number): Promise<ProductReviewSummary | undefined> {
    const [summary] = await db.select().from(productReviewSummaries).where(eq(productReviewSummaries.productId, productId));
    return summary;
  }

  async upsertReviewSummary(summary: InsertReviewSummary): Promise<ProductReviewSummary> {
    const existing = await this.getReviewSummary(summary.productId);
    if (existing) {
      const [updated] = await db.update(productReviewSummaries)
        .set({
          ...summary,
          generatedAt: new Date()
        })
        .where(eq(productReviewSummaries.productId, summary.productId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(productReviewSummaries).values(summary).returning();
    return created;
  }

  async getPriceTracker(userId: string, productId: number): Promise<PriceTracker | undefined> {
    const [tracker] = await db.select().from(priceTrackers)
      .where(and(eq(priceTrackers.userId, userId), eq(priceTrackers.productId, productId)));
    return tracker;
  }

  async getUserPriceTrackers(userId: string): Promise<PriceTracker[]> {
    return await db.select().from(priceTrackers).where(eq(priceTrackers.userId, userId));
  }

  async createPriceTracker(tracker: InsertPriceTracker): Promise<PriceTracker> {
    const [created] = await db.insert(priceTrackers).values(tracker).returning();
    return created;
  }

  async updatePriceTracker(id: number, updates: Partial<InsertPriceTracker>): Promise<PriceTracker> {
    const [updated] = await db.update(priceTrackers)
      .set(updates)
      .where(eq(priceTrackers.id, id))
      .returning();
    return updated;
  }

  async deletePriceTracker(id: number): Promise<void> {
    await db.delete(priceTrackers).where(eq(priceTrackers.id, id));
  }

  async addPriceHistory(entry: InsertPriceHistory): Promise<void> {
    await db.insert(priceHistory).values(entry);
  }

  async getPriceHistory(productId: number, limit = 30): Promise<PriceHistory[]> {
    return await db.select().from(priceHistory)
      .where(eq(priceHistory.productId, productId))
      .orderBy(desc(priceHistory.observedAt))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
