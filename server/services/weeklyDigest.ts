import { db } from "../db";
import { weeklyDigests, products, priceHistory, influencerMentions } from "@shared/schema";
import { eq, gte, desc, and } from "drizzle-orm";

interface TopProduct {
  productId: number;
  name: string;
  reason: 'price_volatility' | 'social_mentions';
  change: number;
}

interface WeeklyDigestResult {
  weekStartDate: Date;
  topProducts: TopProduct[];
  summary: string;
}

export async function generateWeeklyDigest(country?: string): Promise<WeeklyDigestResult> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const sundayOffset = now.getDay();
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - sundayOffset);
  weekStartDate.setHours(0, 0, 0, 0);
  
  const topProducts: TopProduct[] = [];
  
  const productList = country 
    ? await db.select().from(products).where(eq(products.country, country))
    : await db.select().from(products);
  
  for (const product of productList) {
    const priceChanges = await db.select()
      .from(priceHistory)
      .where(and(
        eq(priceHistory.productId, product.id),
        gte(priceHistory.observedAt, weekAgo)
      ))
      .orderBy(desc(priceHistory.observedAt))
      .limit(10);
    
    if (priceChanges.length >= 2) {
      const latestPrice = priceChanges[0].price;
      const oldestPrice = priceChanges[priceChanges.length - 1].price;
      const volatility = Math.abs((latestPrice - oldestPrice) / oldestPrice * 100);
      
      if (volatility > 10) {
        topProducts.push({
          productId: product.id,
          name: product.name,
          reason: 'price_volatility',
          change: Math.round(volatility)
        });
      }
    }
    
    const mentions = await db.select()
      .from(influencerMentions)
      .where(and(
        eq(influencerMentions.productId, product.id),
        gte(influencerMentions.discoveredAt, weekAgo)
      ));
    
    if (mentions.length >= 3) {
      topProducts.push({
        productId: product.id,
        name: product.name,
        reason: 'social_mentions',
        change: mentions.length
      });
    }
  }
  
  topProducts.sort((a, b) => {
    if (a.reason === 'price_volatility' && b.reason !== 'price_volatility') return -1;
    if (b.reason === 'price_volatility' && a.reason !== 'price_volatility') return 1;
    return b.change - a.change;
  });
  
  const limitedProducts = topProducts.slice(0, 10);
  
  let summary = "This week in beauty:\n";
  const priceDrops = limitedProducts.filter(p => p.reason === 'price_volatility');
  const trending = limitedProducts.filter(p => p.reason === 'social_mentions');
  
  if (priceDrops.length > 0) {
    summary += `\n${priceDrops.length} products saw significant price changes`;
  }
  if (trending.length > 0) {
    summary += `\n${trending.length} products are trending with influencer mentions`;
  }
  
  return {
    weekStartDate,
    topProducts: limitedProducts,
    summary
  };
}

export async function saveWeeklyDigest(country?: string): Promise<typeof weeklyDigests.$inferSelect> {
  const digest = await generateWeeklyDigest(country);
  
  const [saved] = await db.insert(weeklyDigests).values({
    weekStartDate: digest.weekStartDate,
    topProducts: digest.topProducts
  }).returning();
  
  return saved;
}

export async function getLatestDigest(): Promise<typeof weeklyDigests.$inferSelect | null> {
  const [digest] = await db.select()
    .from(weeklyDigests)
    .orderBy(desc(weeklyDigests.generatedAt))
    .limit(1);
  
  return digest || null;
}
