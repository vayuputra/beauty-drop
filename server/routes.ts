import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./replit_integrations/auth";
import { db } from "./db";
import { products, retailers, productOffers, productVideos, refreshLogs } from "@shared/schema";
import { searchInfluencersForProduct, searchProductImage } from "./services/perplexity";

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

  // Drops / Products Routes - Only return products with influencer mentions
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
    // Only return products that have influencer mentions (trending products)
    const trendingProducts = await storage.getTrendingProductsByCountry(country);
    res.json(trendingProducts);
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

  // Refresh Trending - Discover influencers for a specific product
  app.post("/api/products/:id/refresh-influencers", async (req, res) => {
    const productId = Number(req.params.id);
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    try {
      // Log the refresh attempt
      await db.insert(refreshLogs).values({
        productId,
        refreshType: 'influencers',
        status: 'pending',
        message: 'Starting influencer discovery...'
      });

      // Search for influencers using Perplexity AI
      const influencers = await searchInfluencersForProduct(
        product.name,
        product.brand,
        product.country
      );

      // Clear existing influencer mentions for this product
      await storage.clearInfluencersForProduct(productId);

      // Add new influencer mentions
      for (const inf of influencers) {
        await storage.addInfluencerMention(productId, {
          name: inf.name,
          handle: inf.handle,
          platform: inf.platform,
          followers: inf.followers,
          videoUrl: inf.videoUrl,
          videoTitle: inf.videoTitle,
          thumbnailUrl: inf.thumbnailUrl || null,
          embedUrl: inf.embedUrl || null
        });
      }

      // Update product's influencer count
      await storage.updateProductInfluencerCount(productId, influencers.length);

      // Log success
      await db.insert(refreshLogs).values({
        productId,
        refreshType: 'influencers',
        status: 'success',
        message: `Found ${influencers.length} influencers`
      });

      res.json({ 
        success: true, 
        influencersFound: influencers.length,
        influencers 
      });
    } catch (error) {
      console.error("Error refreshing influencers:", error);
      
      await db.insert(refreshLogs).values({
        productId,
        refreshType: 'influencers',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({ error: "Failed to refresh influencers" });
    }
  });

  // Refresh product image from official sources
  app.post("/api/products/:id/refresh-image", async (req, res) => {
    const productId = Number(req.params.id);
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    try {
      const imageInfo = await searchProductImage(product.name, product.brand);
      
      if (imageInfo && imageInfo.officialImageUrl) {
        await storage.updateProductImage(productId, imageInfo.officialImageUrl);
        
        await db.insert(refreshLogs).values({
          productId,
          refreshType: 'image',
          status: 'success',
          message: `Found image from ${imageInfo.source}`
        });

        res.json({ 
          success: true, 
          imageUrl: imageInfo.officialImageUrl,
          source: imageInfo.source 
        });
      } else {
        res.json({ success: false, message: "No official image found" });
      }
    } catch (error) {
      console.error("Error refreshing image:", error);
      res.status(500).json({ error: "Failed to refresh image" });
    }
  });

  // Refresh all data for a product (influencers + image)
  app.post("/api/products/:id/refresh-all", async (req, res) => {
    const productId = Number(req.params.id);
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    try {
      // Parallel refresh of influencers and image
      const [influencers, imageInfo] = await Promise.all([
        searchInfluencersForProduct(product.name, product.brand, product.country),
        searchProductImage(product.name, product.brand)
      ]);

      // Update influencers
      await storage.clearInfluencersForProduct(productId);
      for (const inf of influencers) {
        await storage.addInfluencerMention(productId, {
          name: inf.name,
          handle: inf.handle,
          platform: inf.platform,
          followers: inf.followers,
          videoUrl: inf.videoUrl,
          videoTitle: inf.videoTitle,
          thumbnailUrl: inf.thumbnailUrl || null,
          embedUrl: inf.embedUrl || null
        });
      }
      
      // Update product's influencer count
      await storage.updateProductInfluencerCount(productId, influencers.length);

      // Update image if found
      let newImageUrl = product.imageUrl;
      if (imageInfo && imageInfo.officialImageUrl) {
        await storage.updateProductImage(productId, imageInfo.officialImageUrl);
        newImageUrl = imageInfo.officialImageUrl;
      }

      await db.insert(refreshLogs).values({
        productId,
        refreshType: 'all',
        status: 'success',
        message: `Found ${influencers.length} influencers, image ${imageInfo ? 'updated' : 'unchanged'}`
      });

      res.json({ 
        success: true, 
        influencersFound: influencers.length,
        imageUpdated: !!imageInfo,
        newImageUrl
      });
    } catch (error) {
      console.error("Error refreshing all data:", error);
      res.status(500).json({ error: "Failed to refresh data" });
    }
  });

  // Refresh all products (batch operation)
  app.post("/api/refresh-trending", async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const results: { productId: number; name: string; status: string }[] = [];

      // Process products sequentially to avoid rate limits
      for (const product of allProducts) {
        try {
          const influencers = await searchInfluencersForProduct(
            product.name,
            product.brand,
            product.country
          );

          await storage.clearInfluencersForProduct(product.id);
          for (const inf of influencers) {
            await storage.addInfluencerMention(product.id, {
              name: inf.name,
              handle: inf.handle,
              platform: inf.platform,
              followers: inf.followers,
              videoUrl: inf.videoUrl,
              videoTitle: inf.videoTitle,
              thumbnailUrl: inf.thumbnailUrl || null,
              embedUrl: inf.embedUrl || null
            });
          }
          
          // Update product's influencer count
          await storage.updateProductInfluencerCount(product.id, influencers.length);

          results.push({
            productId: product.id,
            name: product.name,
            status: `Found ${influencers.length} influencers`
          });
        } catch (error) {
          results.push({
            productId: product.id,
            name: product.name,
            status: 'Failed'
          });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error("Error in batch refresh:", error);
      res.status(500).json({ error: "Failed to refresh trending data" });
    }
  });

  // Batch refresh all product images
  app.post("/api/refresh-images", async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const results: { productId: number; name: string; status: string; imageUrl?: string }[] = [];

      for (const product of allProducts) {
        try {
          // Skip if image doesn't look like a placeholder
          if (product.imageUrl && !product.imageUrl.includes('unsplash.com')) {
            results.push({
              productId: product.id,
              name: product.name,
              status: 'Skipped (already has custom image)'
            });
            continue;
          }

          const imageInfo = await searchProductImage(product.name, product.brand);
          
          if (imageInfo && imageInfo.officialImageUrl) {
            await storage.updateProductImage(product.id, imageInfo.officialImageUrl);
            
            results.push({
              productId: product.id,
              name: product.name,
              status: `Updated from ${imageInfo.source}`,
              imageUrl: imageInfo.officialImageUrl
            });
          } else {
            results.push({
              productId: product.id,
              name: product.name,
              status: 'No image found'
            });
          }

          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          results.push({
            productId: product.id,
            name: product.name,
            status: 'Failed'
          });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error("Error in batch image refresh:", error);
      res.status(500).json({ error: "Failed to refresh images" });
    }
  });

  // Image Proxy - bypasses hot-linking restrictions by fetching images server-side
  app.get('/api/image-proxy', async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      
      if (!imageUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      // Validate URL is an image URL from allowed domains
      const allowedDomains = [
        'images-static.nykaa.com',
        'cdn.shopify.com',
        'www.sephora.com',
        'www.sephora.me',
        'images.ulta.com',
        'theordinary.com',
        'soldejaneiro.com',
        'www.glowrecipe.com',
        'plumgoodness.com',
        'images.unsplash.com'
      ];

      let urlObj: URL;
      try {
        urlObj = new URL(imageUrl);
      } catch {
        return res.status(400).json({ error: 'Invalid URL' });
      }

      const isAllowed = allowedDomains.some(domain => urlObj.hostname.includes(domain));
      if (!isAllowed) {
        return res.status(403).json({ error: 'Domain not allowed' });
      }

      // Fetch the image without referrer header
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch image' });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();

      // Set caching headers (cache for 1 day)
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Type', contentType);
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Image proxy error:', error);
      res.status(500).json({ error: 'Failed to proxy image' });
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
      logoUrl: "https://placehold.co/100x40/ffffff/000000?text=Sephora"
    }).returning();

    const [ulta] = await db.insert(retailers).values({
      name: "Ulta Beauty",
      country: "US",
      logoUrl: "https://placehold.co/100x40/ffffff/000000?text=Ulta"
    }).returning();

    const [nykaa] = await db.insert(retailers).values({
      name: "Nykaa",
      country: "IN",
      logoUrl: "https://placehold.co/100x40/fc2779/ffffff?text=Nykaa"
    }).returning();

    const [purplle] = await db.insert(retailers).values({
      name: "Purplle",
      country: "IN",
      logoUrl: "https://placehold.co/100x40/8b5cf6/ffffff?text=Purplle"
    }).returning();

    // Additional India retailers for monetization
    const [amazonIn] = await db.insert(retailers).values({
      name: "Amazon India",
      country: "IN",
      logoUrl: "https://placehold.co/100x40/ff9900/000000?text=Amazon"
    }).returning();

    const [myntra] = await db.insert(retailers).values({
      name: "Myntra",
      country: "IN",
      logoUrl: "https://placehold.co/100x40/ff3f6c/ffffff?text=Myntra"
    }).returning();

    const [tataCliq] = await db.insert(retailers).values({
      name: "Tata CLiQ",
      country: "IN",
      logoUrl: "https://placehold.co/100x40/e91e63/ffffff?text=TataCLiQ"
    }).returning();

    const [sephoraIn] = await db.insert(retailers).values({
      name: "Sephora India",
      country: "IN",
      logoUrl: "https://placehold.co/100x40/000000/ffffff?text=Sephora"
    }).returning();

    // Additional US retailers
    const [amazonUs] = await db.insert(retailers).values({
      name: "Amazon",
      country: "US",
      logoUrl: "https://placehold.co/100x40/ff9900/000000?text=Amazon"
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
          }
        ]
      },
      {
        name: "Lip Butter Balm",
        brand: "Summer Fridays",
        category: "Makeup",
        country: "US",
        description: "Silky smooth lip balm with shea and murumuru seed butter for instant hydration.",
        imageUrl: "https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?w=600&h=600&fit=crop",
        whyTrending: "TikTok's favorite lip product! Clean ingredients, maximum hydration.",
        tags: { priceBand: "mid", finish: "glossy" },
        price: 24.00,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "Summer Fridays Lip Butter - Honest Review",
            videoUrl: "https://www.youtube.com/watch?v=lipbutter1",
            embedUrl: "https://www.youtube.com/embed/lipbutter1",
            thumbnailUrl: "https://images.unsplash.com/photo-1619451334792-150fd785ee74?w=300&h=400&fit=crop",
            creatorName: "Susan Yara",
            creatorHandle: "@susanyara",
            creatorFollowers: "1.8M"
          },
          {
            platform: "youtube",
            title: "Best Lip Products 2024",
            videoUrl: "https://www.youtube.com/watch?v=lipbutter2",
            embedUrl: "https://www.youtube.com/embed/lipbutter2",
            thumbnailUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300&h=400&fit=crop",
            creatorName: "Kathleen Lights",
            creatorHandle: "@kathleenlights",
            creatorFollowers: "4.2M"
          }
        ]
      },
      {
        name: "Snail Mucin 96% Power Essence",
        brand: "COSRX",
        category: "Skincare",
        country: "US",
        description: "Lightweight essence with 96% snail secretion filtrate for deep hydration and skin repair.",
        imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop",
        whyTrending: "K-beauty cult favorite! 100M+ bottles sold worldwide.",
        tags: { priceBand: "budget", finish: "hydrating" },
        price: 25.00,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "COSRX Snail Mucin - 1 Year Review",
            videoUrl: "https://www.youtube.com/watch?v=snailmucin1",
            embedUrl: "https://www.youtube.com/embed/snailmucin1",
            thumbnailUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=300&h=400&fit=crop",
            creatorName: "Kelly Driscoll",
            creatorHandle: "@kellydriscoll",
            creatorFollowers: "520K"
          },
          {
            platform: "youtube",
            title: "How I Fixed My Skin with Snail Mucin",
            videoUrl: "https://www.youtube.com/watch?v=snailmucin2",
            embedUrl: "https://www.youtube.com/embed/snailmucin2",
            thumbnailUrl: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=300&h=400&fit=crop",
            creatorName: "James Welsh",
            creatorHandle: "@jameswelsh",
            creatorFollowers: "1.2M"
          }
        ]
      },
      {
        name: "Cloud Paint",
        brand: "Glossier",
        category: "Makeup",
        country: "US",
        description: "Seamless, buildable gel-cream blush for a natural, flushed-from-within look.",
        imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop",
        whyTrending: "The internet's favorite blush! So easy to apply.",
        tags: { priceBand: "mid", finish: "natural" },
        price: 20.00,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "Glossier Cloud Paint - All Shades Reviewed",
            videoUrl: "https://www.youtube.com/watch?v=cloudpaint1",
            embedUrl: "https://www.youtube.com/embed/cloudpaint1",
            thumbnailUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=300&h=400&fit=crop",
            creatorName: "Allana Davison",
            creatorHandle: "@allanadavison",
            creatorFollowers: "1.5M"
          }
        ]
      },
      {
        name: "Retinol 0.5 Treatment",
        brand: "The Ordinary",
        category: "Skincare",
        country: "US",
        description: "Pure retinol serum for reducing fine lines and improving skin texture.",
        imageUrl: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=600&fit=crop",
        whyTrending: "Affordable retinol that actually works! Dermatologist approved.",
        tags: { priceBand: "budget", finish: "anti-aging" },
        price: 8.90,
        currency: "USD",
        videos: [
          {
            platform: "youtube",
            title: "The Ordinary Retinol Guide",
            videoUrl: "https://www.youtube.com/watch?v=ordinary1",
            embedUrl: "https://www.youtube.com/embed/ordinary1",
            thumbnailUrl: "https://images.unsplash.com/photo-1570194065650-d99fb4b38b17?w=300&h=400&fit=crop",
            creatorName: "Cassandra Bankson",
            creatorHandle: "@cassandrabankson",
            creatorFollowers: "2.1M"
          },
          {
            platform: "youtube",
            title: "How to Use The Ordinary Products",
            videoUrl: "https://www.youtube.com/watch?v=ordinary2",
            embedUrl: "https://www.youtube.com/embed/ordinary2",
            thumbnailUrl: "https://images.unsplash.com/photo-1617897903246-719242758050?w=300&h=400&fit=crop",
            creatorName: "Dr. Shereene Idriss",
            creatorHandle: "@shereeneidriss",
            creatorFollowers: "890K"
          }
        ]
      },
    ];

    // India Products with video data
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
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Kay Beauty Lipstick Review - All Shades Swatches",
            videoUrl: "https://www.youtube.com/watch?v=kaybeauty1",
            embedUrl: "https://www.youtube.com/embed/kaybeauty1",
            thumbnailUrl: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=300&h=400&fit=crop",
            creatorName: "Shreya Jain",
            creatorHandle: "@shreyajain",
            creatorFollowers: "2.1M"
          },
          {
            platform: "instagram",
            title: "My go-to lipstick for Indian weddings",
            videoUrl: "https://www.instagram.com/kaybykatrina",
            embedUrl: "https://www.instagram.com/reel/kaybeauty/embed",
            thumbnailUrl: "https://images.unsplash.com/photo-1619451334792-150fd785ee74?w=300&h=400&fit=crop",
            creatorName: "Malvika Sitlani",
            creatorHandle: "@malvikasitlani",
            creatorFollowers: "1.8M"
          }
        ]
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
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Kumkumadi Oil - Worth the Hype? Honest Review",
            videoUrl: "https://www.youtube.com/watch?v=kumkumadi1",
            embedUrl: "https://www.youtube.com/embed/kumkumadi1",
            thumbnailUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=300&h=400&fit=crop",
            creatorName: "Jovita George",
            creatorHandle: "@jovitageorge",
            creatorFollowers: "890K"
          },
          {
            platform: "youtube",
            title: "Bridal Skincare Routine with Kumkumadi",
            videoUrl: "https://www.youtube.com/watch?v=kumkumadi2",
            embedUrl: "https://www.youtube.com/embed/kumkumadi2",
            thumbnailUrl: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=300&h=400&fit=crop",
            creatorName: "Corallista",
            creatorHandle: "@corallista",
            creatorFollowers: "650K"
          },
          {
            platform: "instagram",
            title: "Night routine for glowing skin",
            videoUrl: "https://www.instagram.com/forestessentials",
            embedUrl: "https://www.instagram.com/reel/forest/embed",
            thumbnailUrl: "https://images.unsplash.com/photo-1617897903246-719242758050?w=300&h=400&fit=crop",
            creatorName: "Debasree Banerjee",
            creatorHandle: "@debasreebanerjee",
            creatorFollowers: "1.2M"
          }
        ]
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
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Minimalist Skincare Full Range Review",
            videoUrl: "https://www.youtube.com/watch?v=minimalist1",
            embedUrl: "https://www.youtube.com/embed/minimalist1",
            thumbnailUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300&h=400&fit=crop",
            creatorName: "Prakriti Singh",
            creatorHandle: "@prakritsingh",
            creatorFollowers: "450K"
          },
          {
            platform: "instagram",
            title: "Best budget moisturizer in India",
            videoUrl: "https://www.instagram.com/minimalist",
            embedUrl: "https://www.instagram.com/reel/minimalist/embed",
            thumbnailUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=300&h=400&fit=crop",
            creatorName: "Skin by Dr. V",
            creatorHandle: "@skinbydrv",
            creatorFollowers: "320K"
          }
        ]
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
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Lakme Nail Colors - All Shades Swatches",
            videoUrl: "https://www.youtube.com/watch?v=lakme1",
            embedUrl: "https://www.youtube.com/embed/lakme1",
            thumbnailUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=300&h=400&fit=crop",
            creatorName: "Nidhi Katiyar",
            creatorHandle: "@nidhikatiyar",
            creatorFollowers: "1.5M"
          }
        ]
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
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Plum Rice Water Serum - 30 Day Results",
            videoUrl: "https://www.youtube.com/watch?v=plum1",
            embedUrl: "https://www.youtube.com/embed/plum1",
            thumbnailUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=300&h=400&fit=crop",
            creatorName: "Shweta Vijay",
            creatorHandle: "@shwetavijay",
            creatorFollowers: "780K"
          },
          {
            platform: "instagram",
            title: "My brightening routine with Plum",
            videoUrl: "https://www.instagram.com/plumgoodness",
            embedUrl: "https://www.instagram.com/reel/plum/embed",
            thumbnailUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300&h=400&fit=crop",
            creatorName: "Ankita Chaturvedi",
            creatorHandle: "@corallista",
            creatorFollowers: "650K"
          }
        ]
      },
      {
        name: "Vitamin C 10% Face Serum",
        brand: "Minimalist",
        category: "Skincare",
        country: "IN",
        description: "Ethyl ascorbic acid with ferulic acid for bright, even-toned skin.",
        imageUrl: "https://images.unsplash.com/photo-1570194065650-d99fb4b38b17?w=600&h=600&fit=crop",
        whyTrending: "Affordable vitamin C that actually works! Pharmacy-grade ingredients.",
        tags: { priceBand: "budget", finish: "brightening" },
        price: 545.00,
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Best Vitamin C Serums in India - Comparison",
            videoUrl: "https://www.youtube.com/watch?v=vitc1",
            embedUrl: "https://www.youtube.com/embed/vitc1",
            thumbnailUrl: "https://images.unsplash.com/photo-1570194065650-d99fb4b38b17?w=300&h=400&fit=crop",
            creatorName: "Shreya Jain",
            creatorHandle: "@shreyajain",
            creatorFollowers: "2.1M"
          },
          {
            platform: "youtube",
            title: "Minimalist Vitamin C - 60 Day Update",
            videoUrl: "https://www.youtube.com/watch?v=vitc2",
            embedUrl: "https://www.youtube.com/embed/vitc2",
            thumbnailUrl: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=300&h=400&fit=crop",
            creatorName: "Prakriti Singh",
            creatorHandle: "@prakritsingh",
            creatorFollowers: "450K"
          }
        ]
      },
      {
        name: "Colossal Kajal 24Hr",
        brand: "Maybelline",
        category: "Makeup",
        country: "IN",
        description: "Smudge-proof, waterproof kajal for intense black definition that lasts all day.",
        imageUrl: "https://images.unsplash.com/photo-1631214540553-ff044a3ff1d4?w=600&h=600&fit=crop",
        whyTrending: "India's favorite kajal! Perfect for humid weather.",
        tags: { priceBand: "budget", finish: "matte" },
        price: 325.00,
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Best Kajals for Indian Eyes - Top 10",
            videoUrl: "https://www.youtube.com/watch?v=kajal1",
            embedUrl: "https://www.youtube.com/embed/kajal1",
            thumbnailUrl: "https://images.unsplash.com/photo-1631214540553-ff044a3ff1d4?w=300&h=400&fit=crop",
            creatorName: "Malvika Sitlani",
            creatorHandle: "@malvikasitlani",
            creatorFollowers: "1.8M"
          },
          {
            platform: "instagram",
            title: "Smudge test in Mumbai humidity",
            videoUrl: "https://www.instagram.com/maybellineindia",
            embedUrl: "https://www.instagram.com/reel/kajal/embed",
            thumbnailUrl: "https://images.unsplash.com/photo-1597225244660-1cd128c64284?w=300&h=400&fit=crop",
            creatorName: "Nidhi Katiyar",
            creatorHandle: "@nidhikatiyar",
            creatorFollowers: "1.5M"
          }
        ]
      },
      {
        name: "Sunscreen SPF 50 PA++++",
        brand: "Dot & Key",
        category: "Skincare",
        country: "IN",
        description: "Lightweight, non-greasy sunscreen with vitamin C for daily protection.",
        imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=600&fit=crop",
        whyTrending: "Finally a sunscreen that doesn't leave white cast on Indian skin!",
        tags: { priceBand: "mid", finish: "matte" },
        price: 695.00,
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Best Sunscreens for Indian Skin - No White Cast",
            videoUrl: "https://www.youtube.com/watch?v=sunscreen1",
            embedUrl: "https://www.youtube.com/embed/sunscreen1",
            thumbnailUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300&h=400&fit=crop",
            creatorName: "Jovita George",
            creatorHandle: "@jovitageorge",
            creatorFollowers: "890K"
          }
        ]
      },
      {
        name: "Compact Powder SPF 15",
        brand: "Lakme",
        category: "Makeup",
        country: "IN",
        description: "Silky smooth compact with built-in sunscreen for flawless matte finish.",
        imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop",
        whyTrending: "India's OG compact! Perfect for on-the-go touch ups.",
        tags: { priceBand: "budget", finish: "matte" },
        price: 295.00,
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Lakme 9 to 5 Compact Review",
            videoUrl: "https://www.youtube.com/watch?v=lakmecompact1",
            embedUrl: "https://www.youtube.com/embed/lakmecompact1",
            thumbnailUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=300&h=400&fit=crop",
            creatorName: "Debasree Banerjee",
            creatorHandle: "@debasreebanerjee",
            creatorFollowers: "1.2M"
          }
        ]
      },
      {
        name: "Salicylic Acid 2% Face Serum",
        brand: "Minimalist",
        category: "Skincare",
        country: "IN",
        description: "BHA serum for acne-prone skin, helps unclog pores and reduce breakouts.",
        imageUrl: "https://images.unsplash.com/photo-1617897903246-719242758050?w=600&h=600&fit=crop",
        whyTrending: "Best affordable BHA serum in India! Dermat recommended.",
        tags: { priceBand: "budget", finish: "clarifying" },
        price: 549.00,
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Minimalist Salicylic Acid - 30 Day Review",
            videoUrl: "https://www.youtube.com/watch?v=salicylic1",
            embedUrl: "https://www.youtube.com/embed/salicylic1",
            thumbnailUrl: "https://images.unsplash.com/photo-1617897903246-719242758050?w=300&h=400&fit=crop",
            creatorName: "Shreya Jain",
            creatorHandle: "@shreyajain",
            creatorFollowers: "2.1M"
          },
          {
            platform: "youtube",
            title: "Best Products for Acne in India",
            videoUrl: "https://www.youtube.com/watch?v=salicylic2",
            embedUrl: "https://www.youtube.com/embed/salicylic2",
            thumbnailUrl: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=300&h=400&fit=crop",
            creatorName: "Jovita George",
            creatorHandle: "@jovitageorge",
            creatorFollowers: "890K"
          }
        ]
      },
      {
        name: "Liquid Lipstick Matte",
        brand: "Sugar Cosmetics",
        category: "Makeup",
        country: "IN",
        description: "Long-lasting matte liquid lipstick with intense pigmentation.",
        imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&h=600&fit=crop",
        whyTrending: "Homegrown brand loved for bold Indian shades!",
        tags: { priceBand: "mid", finish: "matte" },
        price: 799.00,
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Sugar Cosmetics Full Range Review",
            videoUrl: "https://www.youtube.com/watch?v=sugar1",
            embedUrl: "https://www.youtube.com/embed/sugar1",
            thumbnailUrl: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=300&h=400&fit=crop",
            creatorName: "Corallista",
            creatorHandle: "@corallista",
            creatorFollowers: "650K"
          }
        ]
      },
      {
        name: "Green Tea Night Gel",
        brand: "Plum",
        category: "Skincare",
        country: "IN",
        description: "Oil-free night gel with green tea extracts for acne control and hydration.",
        imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&h=600&fit=crop",
        whyTrending: "100% vegan and cruelty-free! Perfect for oily skin.",
        tags: { priceBand: "mid", finish: "hydrating" },
        price: 575.00,
        currency: "INR",
        videos: [
          {
            platform: "youtube",
            title: "Plum Green Tea Range - Complete Review",
            videoUrl: "https://www.youtube.com/watch?v=plumgt1",
            embedUrl: "https://www.youtube.com/embed/plumgt1",
            thumbnailUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300&h=400&fit=crop",
            creatorName: "Prakriti Singh",
            creatorHandle: "@prakritsingh",
            creatorFollowers: "450K"
          },
          {
            platform: "youtube",
            title: "Best Night Creams for Oily Skin India",
            videoUrl: "https://www.youtube.com/watch?v=plumgt2",
            embedUrl: "https://www.youtube.com/embed/plumgt2",
            thumbnailUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=300&h=400&fit=crop",
            creatorName: "Shweta Vijay",
            creatorHandle: "@shwetavijay",
            creatorFollowers: "780K"
          }
        ]
      },
    ];

    // Insert US Products with videos
    for (const prod of usProductData) {
      const youtubeVideoCount = prod.videos?.filter(v => v.platform === 'youtube').length || 0;
      const [newProduct] = await db.insert(products).values({
        name: prod.name,
        brand: prod.brand,
        category: prod.category,
        country: prod.country,
        description: prod.description,
        imageUrl: prod.imageUrl,
        whyTrending: prod.whyTrending,
        tags: prod.tags,
        influencerCount: youtubeVideoCount,
        lastInfluencerRefresh: youtubeVideoCount > 0 ? new Date() : null
      }).returning();

      const searchQuery = encodeURIComponent(`${prod.brand} ${prod.name}`);
      if (newProduct && sephora) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: sephora.id,
          price: prod.price,
          currency: prod.currency,
          affiliateUrl: `https://www.sephora.com/search?keyword=${searchQuery}`
        });
      }
      if (newProduct && ulta && prod.brand !== "Rare Beauty") {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: ulta.id,
          price: prod.price * 0.95,
          currency: prod.currency,
          affiliateUrl: `https://www.ulta.com/search?query=${searchQuery}`
        });
      }
      if (newProduct && amazonUs) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: amazonUs.id,
          price: prod.price * 0.92,
          currency: prod.currency,
          affiliateUrl: `https://www.amazon.com/s?k=${searchQuery}`
        });
      }
      
      // Insert videos with influencer info (YouTube only)
      if (newProduct && prod.videos) {
        const youtubeVideos = prod.videos.filter(v => v.platform === 'youtube');
        for (const video of youtubeVideos) {
          const videoSearchQuery = encodeURIComponent(`${video.creatorName} ${prod.brand} ${prod.name} review`);
          const realVideoUrl = `https://www.youtube.com/results?search_query=${videoSearchQuery}`;
          await db.insert(productVideos).values({
            productId: newProduct.id,
            platform: 'youtube',
            title: video.title,
            videoUrl: realVideoUrl,
            embedUrl: video.embedUrl,
            thumbnailUrl: video.thumbnailUrl,
            creatorName: video.creatorName,
            creatorHandle: video.creatorHandle,
            creatorFollowers: video.creatorFollowers
          });
        }
      }
    }

    // Insert India Products with videos
    for (const prod of inProductData) {
      const youtubeVideoCount = prod.videos?.filter(v => v.platform === 'youtube').length || 0;
      const [newProduct] = await db.insert(products).values({
        name: prod.name,
        brand: prod.brand,
        category: prod.category,
        country: prod.country,
        description: prod.description,
        imageUrl: prod.imageUrl,
        whyTrending: prod.whyTrending,
        tags: prod.tags,
        influencerCount: youtubeVideoCount,
        lastInfluencerRefresh: youtubeVideoCount > 0 ? new Date() : null
      }).returning();

      const searchQuery = encodeURIComponent(`${prod.brand} ${prod.name}`);
      if (newProduct && nykaa) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: nykaa.id,
          price: prod.price,
          currency: prod.currency,
          affiliateUrl: `https://www.nykaa.com/search/result/?q=${searchQuery}`
        });
      }
      if (newProduct && purplle) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: purplle.id,
          price: prod.price * 0.9,
          currency: prod.currency,
          affiliateUrl: `https://www.purplle.com/search?q=${searchQuery}`
        });
      }
      if (newProduct && amazonIn) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: amazonIn.id,
          price: prod.price * 0.95,
          currency: prod.currency,
          affiliateUrl: `https://www.amazon.in/s?k=${searchQuery}`
        });
      }
      if (newProduct && myntra) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: myntra.id,
          price: prod.price * 0.88,
          currency: prod.currency,
          affiliateUrl: `https://www.myntra.com/${searchQuery.toLowerCase().replace(/%20/g, '-')}`
        });
      }
      if (newProduct && tataCliq) {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: tataCliq.id,
          price: prod.price * 0.93,
          currency: prod.currency,
          affiliateUrl: `https://www.tatacliq.com/search/?searchCategory=all&text=${searchQuery}`
        });
      }
      if (newProduct && sephoraIn && prod.brand !== "Lakme" && prod.brand !== "Maybelline") {
        await db.insert(productOffers).values({
          productId: newProduct.id,
          retailerId: sephoraIn.id,
          price: prod.price * 1.05,
          currency: prod.currency,
          affiliateUrl: `https://www.sephora.in/search?q=${searchQuery}`
        });
      }
      
      // Insert videos with influencer info (YouTube only)
      if (newProduct && prod.videos) {
        const youtubeVideos = prod.videos.filter(v => v.platform === 'youtube');
        for (const video of youtubeVideos) {
          const videoSearchQuery = encodeURIComponent(`${video.creatorName} ${prod.brand} ${prod.name} review`);
          const realVideoUrl = `https://www.youtube.com/results?search_query=${videoSearchQuery}`;
          await db.insert(productVideos).values({
            productId: newProduct.id,
            platform: 'youtube',
            title: video.title,
            videoUrl: realVideoUrl,
            embedUrl: video.embedUrl,
            thumbnailUrl: video.thumbnailUrl,
            creatorName: video.creatorName,
            creatorHandle: video.creatorHandle,
            creatorFollowers: video.creatorFollowers
          });
        }
      }
    }

    console.log("Database seeded successfully!");
  }
}
