import { db } from "./db";
import {
  users, products, retailers, productOffers, productVideos, clicks,
  type User, type InsertUser, type UpdateUserRequest,
  type Product, type ProductWithDetails, type InsertClick
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // User
  getUser(id: string): Promise<User | undefined>;
  updateUser(id: string, updates: UpdateUserRequest): Promise<User>;

  // Products & Drops
  getProductsByCountry(country: string): Promise<Product[]>;
  getProduct(id: number): Promise<ProductWithDetails | undefined>;
  
  // Analytics
  trackClick(click: InsertClick): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, updates: UpdateUserRequest): Promise<User> {
    // Check if user exists first
    const existingUser = await this.getUser(id);
    
    if (existingUser) {
      // Update existing user
      const [user] = await db.update(users)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      return user;
    } else {
      // Insert new user (upsert behavior)
      const [user] = await db.insert(users)
        .values({
          id,
          ...updates
        })
        .returning();
      return user;
    }
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

    return {
      ...product,
      offers,
      videos
    };
  }

  async trackClick(click: InsertClick): Promise<void> {
    await db.insert(clicks).values(click);
  }
}

export const storage = new DatabaseStorage();
