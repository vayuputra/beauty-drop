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

    // US Products with working images and video data
    const usProductData = [
      {
        name: "Soft Pinch Liquid Blush",
        brand: "Rare Beauty",
        category: "Makeup",
        country: "US",
        description: "A weightless, long-lasting liquid blush that blends and builds beautifully for a soft, healthy flush.",
        imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop",
        whyTrending: "Viral on TikTok for its high pigmentation and lasting power.",
        tags: { priceBand: "mid", finish: "dewy" },
        price: 23.00,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "Rare Beauty Blush Review - Worth the Hype?",
            videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
            thumbnailUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300&h=400&fit=crop",
            creatorName: "Jackie Aina",
            creatorHandle: "@jackieaina",
            creatorFollowers: "3.5M"
          },
          {
            platform: "tiktok",
            title: "One dot is all you need!",
            videoUrl: "https://www.tiktok.com/@rarebeauty",
            embedUrl: "https://www.tiktok.com/embed/v2/7200000000000000000",
            thumbnailUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=300&h=400&fit=crop",
            creatorName: "Mikayla Nogueira",
            creatorHandle: "@mikaylanogueira",
            creatorFollowers: "15.2M"
          },
          {
            platform: "instagram",
            title: "My everyday blush routine",
            videoUrl: "https://www.instagram.com/rarebeauty",
            embedUrl: "https://www.instagram.com/reel/ABC123/embed",
            thumbnailUrl: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=300&h=400&fit=crop",
            creatorName: "Nikkie de Jager",
            creatorHandle: "@nikkietutorials",
            creatorFollowers: "16.8M"
          }
        ]
      },
      {
        name: "Black Honey Lip Balm",
        brand: "Clinique",
        category: "Makeup",
        country: "US",
        description: "Iconic sheer berry tint that adapts to your unique chemistry for a personalized flush.",
        imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&h=600&fit=crop",
        whyTrending: "90s nostalgia comeback! The OG universally flattering lip color.",
        tags: { priceBand: "mid", finish: "sheer" },
        price: 22.00,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "The Original 90s Lip is BACK",
            videoUrl: "https://www.youtube.com/watch?v=example1",
            embedUrl: "https://www.youtube.com/embed/example1",
            thumbnailUrl: "https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?w=300&h=400&fit=crop",
            creatorName: "Robert Welsh",
            creatorHandle: "@robertwelsh",
            creatorFollowers: "1.2M"
          },
          {
            platform: "tiktok",
            title: "POV: Your mom's favorite lip product",
            videoUrl: "https://www.tiktok.com/@clinique",
            embedUrl: "https://www.tiktok.com/embed/v2/7300000000000000000",
            thumbnailUrl: "https://images.unsplash.com/photo-1619451334792-150fd785ee74?w=300&h=400&fit=crop",
            creatorName: "Alix Earle",
            creatorHandle: "@alixearle",
            creatorFollowers: "6.8M"
          }
        ]
      },
      {
        name: "Watermelon Glow Dew Drops",
        brand: "Glow Recipe",
        category: "Skincare",
        country: "US",
        description: "Hyaluronic acid serum with watermelon, vitamin E, and light-reflecting pigments for instant glow.",
        imageUrl: "https://images.unsplash.com/photo-1570194065650-d99fb4b38b17?w=600&h=600&fit=crop",
        whyTrending: "Glass skin in a bottle! Celebrity makeup artists swear by it.",
        tags: { priceBand: "high", finish: "dewy" },
        price: 34.00,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "Glass Skin Tutorial with Glow Recipe",
            videoUrl: "https://www.youtube.com/watch?v=example2",
            embedUrl: "https://www.youtube.com/embed/example2",
            thumbnailUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=300&h=400&fit=crop",
            creatorName: "Hyram Yarbro",
            creatorHandle: "@hyaboratory",
            creatorFollowers: "4.5M"
          },
          {
            platform: "instagram",
            title: "My morning skincare routine",
            videoUrl: "https://www.instagram.com/glowrecipe",
            embedUrl: "https://www.instagram.com/reel/DEF456/embed",
            thumbnailUrl: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=300&h=400&fit=crop",
            creatorName: "James Welsh",
            creatorHandle: "@james_s_welsh",
            creatorFollowers: "892K"
          },
          {
            platform: "tiktok",
            title: "The dewiest skin ever",
            videoUrl: "https://www.tiktok.com/@glowrecipe",
            embedUrl: "https://www.tiktok.com/embed/v2/7400000000000000000",
            thumbnailUrl: "https://images.unsplash.com/photo-1617897903246-719242758050?w=300&h=400&fit=crop",
            creatorName: "Skincare by Cassandra",
            creatorHandle: "@skincaresbycass",
            creatorFollowers: "2.1M"
          }
        ]
      },
      {
        name: "Lash Sensational Sky High Mascara",
        brand: "Maybelline",
        category: "Makeup",
        country: "US",
        description: "Lengthening and volumizing mascara with flex tower brush for limitless length.",
        imageUrl: "https://images.unsplash.com/photo-1631214540553-ff044a3ff1d4?w=600&h=600&fit=crop",
        whyTrending: "Drugstore mascara that rivals luxury! 10M+ TikTok views.",
        tags: { priceBand: "budget", finish: "dramatic" },
        price: 13.99,
        currency: "USD",
        videos: [
          {
            platform: "tiktok",
            title: "This $14 mascara changed my life",
            videoUrl: "https://www.tiktok.com/@maybelline",
            embedUrl: "https://www.tiktok.com/embed/v2/7500000000000000000",
            thumbnailUrl: "https://images.unsplash.com/photo-1597225244660-1cd128c64284?w=300&h=400&fit=crop",
            creatorName: "Meredith Duxbury",
            creatorHandle: "@meredithduxbury",
            creatorFollowers: "18.5M"
          },
          {
            platform: "youtube",
            title: "Best Drugstore Mascara 2024",
            videoUrl: "https://www.youtube.com/watch?v=example3",
            embedUrl: "https://www.youtube.com/embed/example3",
            thumbnailUrl: "https://images.unsplash.com/photo-1583241800698-e8ab01d85f4e?w=300&h=400&fit=crop",
            creatorName: "Taylor Wynn",
            creatorHandle: "@taylorwynn",
            creatorFollowers: "1.1M"
          }
        ]
      },
      {
        name: "Brazilian Bum Bum Cream",
        brand: "Sol de Janeiro",
        category: "Body",
        country: "US",
        description: "Fast-absorbing body cream with cupuacu butter and coconut oil for silky skin.",
        imageUrl: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&h=600&fit=crop",
        whyTrending: "The iconic Brazilian scent everyone is obsessed with!",
        tags: { priceBand: "high", finish: "smooth" },
        price: 48.00,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "Why Everyone is Obsessed with This Scent",
            videoUrl: "https://www.youtube.com/watch?v=example4",
            embedUrl: "https://www.youtube.com/embed/example4",
            thumbnailUrl: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300&h=400&fit=crop",
            creatorName: "Samantha Ravndahl",
            creatorHandle: "@ssssamanthaa",
            creatorFollowers: "2.3M"
          },
          {
            platform: "tiktok",
            title: "The scent that gets me compliments",
            videoUrl: "https://www.tiktok.com/@soldejaneiro",
            embedUrl: "https://www.tiktok.com/embed/v2/7600000000000000000",
            thumbnailUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300&h=400&fit=crop",
            creatorName: "Tinx",
            creatorHandle: "@itsmetinx",
            creatorFollowers: "1.5M"
          }
        ]
      },
    ];

    // India Products (no videos - US only feature)
    const inProductData = [
      {
        name: "Matte Drama Long Stay Lipstick",
        brand: "Kay Beauty",
        category: "Makeup",
        country: "IN",
        description: "Long stay matte lipstick enriched with vitamin E for comfortable wear.",
        imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&h=600&fit=crop",
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
        imageUrl: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=600&fit=crop",
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
        imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop",
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
        imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&h=600&fit=crop",
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
        imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop",
        whyTrending: "K-beauty meets Ayurveda! Vegan and cruelty-free.",
        tags: { priceBand: "mid", finish: "brightening" },
        price: 699.00,
        currency: "INR"
      },
    ];

    // Insert US Products with videos
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
      
      // Insert videos with influencer info (US only)
      if (newProduct && prod.videos) {
        for (const video of prod.videos) {
          await db.insert(productVideos).values({
            productId: newProduct.id,
            platform: video.platform,
            title: video.title,
            videoUrl: video.videoUrl,
            embedUrl: video.embedUrl,
            thumbnailUrl: video.thumbnailUrl,
            creatorName: video.creatorName,
            creatorHandle: video.creatorHandle,
            creatorFollowers: video.creatorFollowers
          });
        }
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
