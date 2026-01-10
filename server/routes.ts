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

    const [ulta] = await db.insert(retailers).values({
      name: "Ulta Beauty",
      country: "US",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Ulta_Beauty_logo.svg/1200px-Ulta_Beauty_logo.svg.png"
    }).returning();

    const [nykaa] = await db.insert(retailers).values({
      name: "Nykaa",
      country: "IN",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Nykaa_Logo.svg/1200px-Nykaa_Logo.svg.png"
    }).returning();

    const [purplle] = await db.insert(retailers).values({
      name: "Purplle",
      country: "IN",
      logoUrl: "https://cdn.purplle.com/static/img/logo.svg"
    }).returning();

    // US Products
    const usProductData = [
      {
        name: "Soft Pinch Liquid Blush",
        brand: "Rare Beauty",
        category: "Makeup",
        country: "US",
        description: "A weightless, long-lasting liquid blush that blends and builds beautifully for a soft, healthy flush.",
        imageUrl: "https://www.sephora.com/productimages/sku/s2362085-main-zoom.jpg",
        whyTrending: "Viral on TikTok for its high pigmentation and lasting power.",
        tags: { priceBand: "mid", finish: "dewy" },
        price: 23.00,
        currency: "USD"
      },
      {
        name: "Black Honey Lip Balm",
        brand: "Clinique",
        category: "Makeup",
        country: "US",
        description: "Iconic sheer berry tint that adapts to your unique chemistry for a personalized flush.",
        imageUrl: "https://www.sephora.com/productimages/sku/s2518447-main-zoom.jpg",
        whyTrending: "90s nostalgia comeback! The OG universally flattering lip color.",
        tags: { priceBand: "mid", finish: "sheer" },
        price: 22.00,
        currency: "USD"
      },
      {
        name: "Glow Recipe Watermelon Dew Drops",
        brand: "Glow Recipe",
        category: "Skincare",
        country: "US",
        description: "Hyaluronic acid serum with watermelon, vitamin E, and light-reflecting pigments for instant glow.",
        imageUrl: "https://www.sephora.com/productimages/sku/s2210516-main-zoom.jpg",
        whyTrending: "Glass skin in a bottle! Celebrity makeup artists swear by it.",
        tags: { priceBand: "high", finish: "dewy" },
        price: 34.00,
        currency: "USD"
      },
      {
        name: "Lash Sensational Sky High Mascara",
        brand: "Maybelline",
        category: "Makeup",
        country: "US",
        description: "Lengthening and volumizing mascara with flex tower brush for limitless length.",
        imageUrl: "https://www.ulta.com/p/lash-sensational-sky-high-mascara-pimprod2012934",
        whyTrending: "Drugstore mascara that rivals luxury! 10M+ TikTok views.",
        tags: { priceBand: "budget", finish: "dramatic" },
        price: 13.99,
        currency: "USD"
      },
      {
        name: "Sol de Janeiro Bum Bum Cream",
        brand: "Sol de Janeiro",
        category: "Body",
        country: "US",
        description: "Fast-absorbing body cream with cupuacu butter and coconut oil for silky skin.",
        imageUrl: "https://www.sephora.com/productimages/sku/s1930791-main-zoom.jpg",
        whyTrending: "The iconic Brazilian scent everyone is obsessed with!",
        tags: { priceBand: "high", finish: "smooth" },
        price: 48.00,
        currency: "USD"
      },
    ];

    // India Products
    const inProductData = [
      {
        name: "Matte Drama Long Stay Lipstick",
        brand: "Kay Beauty",
        category: "Makeup",
        country: "IN",
        description: "Long stay matte lipstick enriched with vitamin E for comfortable wear.",
        imageUrl: "https://images-static.nykaa.com/media/catalog/product/tr:w-220,h-220,cm-pad_resize/0/4/04ac8f28904330902640_1.jpg",
        whyTrending: "Katrina Kaif's brand, highly rated for Indian skin tones.",
        tags: { priceBand: "budget", finish: "matte" },
        price: 999.00,
        currency: "INR"
      },
      {
        name: "Kumkumadi Tailam Face Oil",
        brand: "Forest Essentials",
        category: "Skincare",
        country: "IN",
        description: "Ayurvedic night serum with saffron and 16 precious herbs for radiant skin.",
        imageUrl: "https://www.forestessentialsindia.com/media/catalog/product/k/u/kumkumadi-thailam-35ml_1.jpg",
        whyTrending: "Ancient Ayurvedic secret for bridal glow! Dermatologist approved.",
        tags: { priceBand: "high", finish: "radiant" },
        price: 2650.00,
        currency: "INR"
      },
      {
        name: "Hydra Boost Moisturizer",
        brand: "Minimalist",
        category: "Skincare",
        country: "IN",
        description: "Lightweight gel moisturizer with 5% marula oil and squalane for deep hydration.",
        imageUrl: "https://images-static.nykaa.com/media/catalog/product/tr:w-220,h-220,cm-pad_resize/d/4/d428b17MINIM00000028_1.jpg",
        whyTrending: "Indian skincare brand going global! Clean beauty at its best.",
        tags: { priceBand: "budget", finish: "hydrating" },
        price: 599.00,
        currency: "INR"
      },
      {
        name: "Nude Nail Enamel Collection",
        brand: "Lakme",
        category: "Nails",
        country: "IN",
        description: "Long-lasting, chip-resistant nail polish in universally flattering nude shades.",
        imageUrl: "https://images-static.nykaa.com/media/catalog/product/tr:w-220,h-220,cm-pad_resize/l/a/lakme-9to5-primer-nail-colour-nude-peach-9ml_1.jpg",
        whyTrending: "Office-approved nudes that work for every occasion.",
        tags: { priceBand: "budget", finish: "glossy" },
        price: 250.00,
        currency: "INR"
      },
      {
        name: "Rice Water Brightening Serum",
        brand: "Plum",
        category: "Skincare",
        country: "IN",
        description: "Korean-inspired brightening serum with fermented rice water and niacinamide.",
        imageUrl: "https://images-static.nykaa.com/media/catalog/product/tr:w-220,h-220,cm-pad_resize/p/l/plum-rice-water-bright-serum-30ml_1.jpg",
        whyTrending: "K-beauty meets Ayurveda! Vegan and cruelty-free.",
        tags: { priceBand: "mid", finish: "brightening" },
        price: 699.00,
        currency: "INR"
      },
    ];

    // Insert US Products
    for (const prod of usProductData) {
      const [newProduct] = await db.insert(products).values({
        name: prod.name,
        brand: prod.brand,
        category: prod.category,
        country: prod.country,
        description: prod.description,
        imageUrl: prod.imageUrl,
        whyTrending: prod.whyTrending,
        tags: prod.tags
      }).returning();

      if (newProduct && sephora) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: sephora.id,
          price: prod.price,
          currency: prod.currency,
          affiliateUrl: `https://www.sephora.com/product/${prod.name.toLowerCase().replace(/\s+/g, '-')}`
        });
      }
      if (newProduct && ulta && prod.brand !== "Rare Beauty") {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: ulta.id,
          price: prod.price * 0.95,
          currency: prod.currency,
          affiliateUrl: `https://www.ulta.com/product/${prod.name.toLowerCase().replace(/\s+/g, '-')}`
        });
      }
    }

    // Insert India Products
    for (const prod of inProductData) {
      const [newProduct] = await db.insert(products).values({
        name: prod.name,
        brand: prod.brand,
        category: prod.category,
        country: prod.country,
        description: prod.description,
        imageUrl: prod.imageUrl,
        whyTrending: prod.whyTrending,
        tags: prod.tags
      }).returning();

      if (newProduct && nykaa) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: nykaa.id,
          price: prod.price,
          currency: prod.currency,
          affiliateUrl: `https://www.nykaa.com/product/${prod.name.toLowerCase().replace(/\s+/g, '-')}`
        });
      }
      if (newProduct && purplle) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: purplle.id,
          price: prod.price * 0.9,
          currency: prod.currency,
          affiliateUrl: `https://www.purplle.com/product/${prod.name.toLowerCase().replace(/\s+/g, '-')}`
        });
      }
    }

    console.log("Database seeded successfully!");
  }
}
