import { db } from "./db";
import {
  users, products, retailers, productOffers, productVideos, clicks, influencerMentions,
  type User, type InsertUser, type UpdateUserRequest,
  type Product, type ProductWithDetails, type InsertClick, type InfluencerMention
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User
  getUser(id: string): Promise<User | undefined>;
  updateUser(id: string, updates: UpdateUserRequest): Promise<User>;

  // Products & Drops
  getProductsByCountry(country: string): Promise<Product[]>;
  getProduct(id: number): Promise<ProductWithDetails | undefined>;
  getAllProducts(): Promise<Product[]>;
  updateProductImage(productId: number, imageUrl: string): Promise<void>;
  
  // Influencers
  getInfluencersForProduct(productId: number): Promise<InfluencerMention[]>;
  addInfluencerMention(productId: number, influencer: Omit<InfluencerMention, 'id' | 'productId' | 'discoveredAt'>): Promise<void>;
  clearInfluencersForProduct(productId: number): Promise<void>;
  
  // Analytics
  trackClick(click: InsertClick): Promise<void>;
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
}

export const storage = new DatabaseStorage();
