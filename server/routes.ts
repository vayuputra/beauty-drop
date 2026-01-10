import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./replit_integrations/auth"; // Correct path for auth
import { db } from "./db";
import { products, retailers, productOffers, productVideos } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Set up authentication (Passport + Session)
  await setupAuth(app);

  // User Routes - Return merged auth claims + DB user data
  app.get(api.user.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const claims = (req.user as any).claims;
    const userId = claims?.sub;
    
    if (!userId) return res.sendStatus(401);
    
    // Get DB user data (country, preferences)
    const dbUser = await storage.getUser(userId);
    
    // Return merged object
    res.json({
      id: userId,
      email: claims.email,
      firstName: claims.first_name,
      lastName: claims.last_name,
      profileImageUrl: claims.profile_image_url,
      country: dbUser?.country || null,
      preferences: dbUser?.preferences || null,
    });
  });

  app.patch(api.user.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.sendStatus(401);
      
      const input = api.user.update.input.parse(req.body);
      const user = await storage.updateUser(userId, input);
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Drops / Products Routes
  app.get(api.drops.list.path, async (req, res) => {
    // Get country from query param first, then try to fetch from DB based on user
    let country = req.query.country as string;
    
    if (!country && req.isAuthenticated()) {
      const userId = (req.user as any).claims?.sub;
      if (userId) {
        const dbUser = await storage.getUser(userId);
        country = dbUser?.country || 'US';
      }
    }
    
    country = country || 'US';
    const products = await storage.getProductsByCountry(country);
    res.json(products);
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) return res.sendStatus(404);
    res.json(product);
  });

  // Analytics
  app.post(api.clicks.track.path, async (req, res) => {
    try {
      const input = api.clicks.track.input.parse(req.body);
      const userId = req.isAuthenticated() ? (req.user as any).claims?.sub : undefined;
      await storage.trackClick({
        ...input,
        userId
      });
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false });
    }
  });

  // Seed Data function
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const usProducts = await storage.getProductsByCountry('US');
  if (usProducts.length === 0) {
    console.log("Seeding Database...");
    
    // Create Retailers
    const [sephora] = await db.insert(retailers).values({
      name: "Sephora",
      country: "US",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Sephora_logo.svg/2560px-Sephora_logo.svg.png"
    }).returning();

    const [nykaa] = await db.insert(retailers).values({
      name: "Nykaa",
      country: "IN",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Nykaa_Logo.svg/1200px-Nykaa_Logo.svg.png"
    }).returning();

    // Create US Product
    const [productUS] = await db.insert(products).values({
      name: "Soft Pinch Liquid Blush",
      brand: "Rare Beauty",
      category: "Makeup",
      country: "US",
      description: "A weightless, long-lasting liquid blush that blends and builds beautifully for a soft, healthy flush.",
      imageUrl: "https://www.sephora.com/productimages/sku/s2362085-main-zoom.jpg",
      whyTrending: "Viral on TikTok for its high pigmentation and lasting power.",
      tags: { priceBand: "mid", finish: "dewy" }
    }).returning();

    // Create IN Product
    const [productIN] = await db.insert(products).values({
      name: "Matte Lipstick",
      brand: "Kay Beauty",
      category: "Makeup",
      country: "IN",
      description: "Long stay matte lipstick with vitamin E.",
      imageUrl: "https://images-static.nykaa.com/media/catalog/product/tr:w-220,h-220,cm-pad_resize/0/4/04ac8f28904330902640_1.jpg",
      whyTrending: "Katrina Kaif's brand, highly rated for Indian skin tones.",
      tags: { priceBand: "budget", finish: "matte" }
    }).returning();

    // Offers
    if (productUS && sephora) {
      await db.insert(productOffers).values({
        productId: productUS.id,
        retailerId: sephora.id,
        price: 23.00,
        currency: "USD",
        affiliateUrl: "https://www.sephora.com/product/rare-beauty-by-selena-gomez-soft-pinch-liquid-blush-P97989778"
      });
      await db.insert(productVideos).values({
        productId: productUS.id,
        platform: "tiktok",
        title: "Trying the new shades!",
        videoUrl: "https://www.tiktok.com/@rarebeauty/video/7200000000000000000",
        thumbnailUrl: "https://placehold.co/100x150?text=TikTok"
      });
    }

    if (productIN && nykaa) {
      await db.insert(productOffers).values({
        productId: productIN.id,
        retailerId: nykaa.id,
        price: 999.00,
        currency: "INR",
        affiliateUrl: "https://www.nykaa.com/kay-beauty-matte-drama-long-stay-lipstick/p/561746"
      });
    }
  }
}
