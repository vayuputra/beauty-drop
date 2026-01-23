import { db } from "../db";
import { priceTrackers, productOffers, priceHistory, retailers } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { storage } from "../storage";

interface PriceAlert {
  trackerId: number;
  userId: string;
  productId: number;
  productName: string;
  oldPrice: number;
  newPrice: number;
  retailerName: string;
  priceDropPercent: number;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export async function checkPricesForAllTrackers(): Promise<PriceAlert[]> {
  const alerts: PriceAlert[] = [];
  
  try {
    const activeTrackers = await db.select().from(priceTrackers).where(eq(priceTrackers.isActive, true));
    
    for (const tracker of activeTrackers) {
      const productAlerts = await checkPriceForTracker(tracker);
      alerts.push(...productAlerts);
    }
    
    return alerts;
  } catch (error) {
    console.error("Error checking prices:", error);
    return alerts;
  }
}

async function checkPriceForTracker(tracker: typeof priceTrackers.$inferSelect): Promise<PriceAlert[]> {
  const alerts: PriceAlert[] = [];
  
  try {
    const product = await storage.getProduct(tracker.productId);
    if (!product) return alerts;
    
    const offers = await db.select({
      offer: productOffers,
      retailer: retailers
    })
    .from(productOffers)
    .innerJoin(retailers, eq(productOffers.retailerId, retailers.id))
    .where(eq(productOffers.productId, tracker.productId));
    
    for (const { offer, retailer } of offers) {
      const history = await db.select()
        .from(priceHistory)
        .where(and(
          eq(priceHistory.productId, tracker.productId),
          eq(priceHistory.retailerId, retailer.id)
        ))
        .orderBy(desc(priceHistory.observedAt))
        .limit(1);
      
      const lastPrice = history.length > 0 ? history[0].price : null;
      const currentPrice = offer.price;
      
      await storage.addPriceHistory({
        productId: tracker.productId,
        retailerId: retailer.id,
        price: currentPrice,
        currency: offer.currency
      });
      
      if (lastPrice === null) continue;
      
      const priceDrop = lastPrice - currentPrice;
      const priceDropPercent = (priceDrop / lastPrice) * 100;
      
      const shouldAlert = 
        (tracker.notifyOnAnyDrop && priceDrop > 0) ||
        (tracker.targetPrice && currentPrice <= tracker.targetPrice);
      
      if (shouldAlert) {
        alerts.push({
          trackerId: tracker.id,
          userId: tracker.userId,
          productId: tracker.productId,
          productName: product.name,
          oldPrice: lastPrice,
          newPrice: currentPrice,
          retailerName: retailer.name,
          priceDropPercent
        });
        
        await db.update(priceTrackers)
          .set({ lastNotifiedAt: new Date() })
          .where(eq(priceTrackers.id, tracker.id));
      }
    }
    
    return alerts;
  } catch (error) {
    console.error(`Error checking price for tracker ${tracker.id}:`, error);
    return alerts;
  }
}

let priceCheckInterval: NodeJS.Timeout | null = null;

export function startPriceCheckJob(): void {
  if (priceCheckInterval) {
    console.log("Price check job already running");
    return;
  }
  
  console.log("Starting background price check job (every 6 hours)");
  
  priceCheckInterval = setInterval(async () => {
    console.log("Running scheduled price check...");
    const alerts = await checkPricesForAllTrackers();
    console.log(`Price check complete. Found ${alerts.length} alerts.`);
  }, SIX_HOURS_MS);
  
  checkPricesForAllTrackers().then(alerts => {
    console.log(`Initial price check complete. Found ${alerts.length} alerts.`);
  });
}

export function stopPriceCheckJob(): void {
  if (priceCheckInterval) {
    clearInterval(priceCheckInterval);
    priceCheckInterval = null;
    console.log("Price check job stopped");
  }
}
