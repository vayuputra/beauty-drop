import type { Express, Request } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, isAdmin, getUserId, isAdminUser } from "./auth";
import { isAdminEmail } from "./auth/identity";
import { db } from "./db";
import { eq, desc, sql, and, gte, count, inArray } from "drizzle-orm";
import { products, retailers, productOffers, productVideos, refreshLogs, priceHistory, favorites, notifications, productArticles, comparisons, clicks } from "@shared/schema";
import { users } from "@shared/models/auth";
import { searchInfluencersForProduct, searchProductImage, getPlaceholderImage, resolveProductImage } from "./services/perplexity";
import { handleImageProxy } from "./lib/imageProxy";
import { generateProductTrustScore, getTrustLabel } from "./services/trustScore";
import { generateProductReviewSummary } from "./services/reviewSynthesis";
import { verifyProductImage } from "./services/imageVerification";
import { generateSmartLink } from "./services/deepLinks";
import { generateWeeklyDigest, saveWeeklyDigest, getLatestDigest } from "./services/weeklyDigest";
import { fetchProductPrices, triggerBackgroundRefresh, checkPythonFetcherHealth, isPriceFetcherConfigured, updateProductPricesFromFetch } from "./services/priceFetcher";
import { fetchArticlesForProduct } from "./services/articles";
import { cache, CACHE_TTL } from "./services/cache";
import { checkPricesForAllTrackers } from "./services/priceChecker";
import { isValidCronRequest } from "./lib/cron";
import bcrypt from "bcryptjs";

function parseProductId(id: string): number | null {
  const parsed = Number(id);
  if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

const HOUR_MS = 60 * 60 * 1000;

/** How long AI-derived enrichment is reused before a non-admin request may recompute it. */
const ENRICHMENT_TTL = {
  influencers: 24 * HOUR_MS,
  trustScore: 7 * 24 * HOUR_MS,
  reviewSummary: 7 * 24 * HOUR_MS,
} as const;

function isFresh(at: Date | string | null | undefined, ttlMs: number): boolean {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < ttlMs;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Set up authentication (Passport + Session)
  await setupAuth(app);

  // Current user profile (identity + preferences), read from the users table.
  app.get(api.user.get.path, async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const dbUser = await storage.getUser(userId);
    if (!dbUser) return res.sendStatus(401);

    res.json({
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      country: dbUser.country || null,
      preferences: dbUser.preferences || null,
      isAdmin: isAdminEmail(dbUser.email),
    });
  });

  app.patch(api.user.update.path, async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const parsed = api.user.update.input.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const user = await storage.updateUser(userId, parsed.data);
    res.json(user);
  });

  // Drops / Products Routes
  app.get(api.drops.list.path, async (req, res) => {
    let country = typeof req.query.country === "string" ? req.query.country : undefined;

    const userId = getUserId(req);
    if (!country && userId) {
      const dbUser = await storage.getUser(userId);
      country = dbUser?.country || undefined;
    }

    country = country === "IN" ? "IN" : "US";

    // Check cache first
    const cacheKey = `drops:${country}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    // Only return products that have influencer mentions (trending products)
    const trendingProducts = await storage.getTrendingProductsByCountry(country);
    cache.set(cacheKey, trendingProducts, CACHE_TTL.DROPS);
    res.json(trendingProducts);
  });

  // Search products
  app.get("/api/search", async (req, res) => {
    const query = (typeof req.query.q === "string" ? req.query.q : "").trim().slice(0, 100);
    if (query.length < 2) {
      return res.json([]);
    }
    const country = req.query.country === "IN" || req.query.country === "US" ? req.query.country : undefined;

    const cacheKey = `search:${query}:${country || 'all'}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    const results = await storage.searchProducts(query, country);
    cache.set(cacheKey, results, CACHE_TTL.SEARCH);
    res.json(results);
  });

  app.get(api.products.get.path, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });

    const cacheKey = `product:${productId}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    const product = await storage.getProduct(productId);
    if (!product) return res.sendStatus(404);

    cache.set(cacheKey, product, CACHE_TTL.PRODUCT);
    res.json(product);
  });

  // Analytics
  app.post(api.clicks.track.path, async (req, res) => {
    try {
      const input = api.clicks.track.input.parse(req.body);
      const userId = getUserId(req);
      await storage.trackClick({
        ...input,
        userId
      });
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false });
    }
  });

  // Favorites / Wishlist Routes
  app.get("/api/favorites", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const favs = await storage.getUserFavorites(userId);
    res.json(favs);
  });

  app.get("/api/favorites/ids", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const favs = await db.select({ productId: favorites.productId })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    res.json(favs.map(f => f.productId));
  });

  app.post("/api/products/:id/favorite", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });

    const already = await storage.isFavorite(userId, productId);
    if (already) return res.json({ success: true, message: "Already favorited" });

    await storage.addFavorite(userId, productId);
    res.status(201).json({ success: true });
  });

  app.delete("/api/products/:id/favorite", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });

    await storage.removeFavorite(userId, productId);
    res.json({ success: true });
  });

  // Discover creator mentions for one product. Signed-in users can trigger it, but
  // results are reused for 24h so repeated taps don't each spend an AI call.
  app.post("/api/products/:id/refresh-influencers", isAuthenticated, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const product = await storage.getProduct(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (isFresh(product.lastInfluencerRefresh, ENRICHMENT_TTL.influencers) && !(await isAdminUser(getUserId(req)))) {
      return res.json({
        success: true,
        cached: true,
        influencersFound: product.influencers?.length ?? 0,
        influencers: product.influencers ?? [],
      });
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
      cache.invalidate(`product:${productId}`);
      cache.invalidatePattern("drops:");

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

  // Refresh product image from official sources (operator tool)
  app.post("/api/products/:id/refresh-image", isAdmin, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    try {
      const imageInfo = await searchProductImage(product.name, product.brand, product.category);

      if (imageInfo && imageInfo.officialImageUrl) {
        // Verify the image is actually the right product using GPT-4o vision
        let verified = true;
        try {
          const verification = await verifyProductImage(product, imageInfo.officialImageUrl);
          verified = verification.isAuthentic && (verification.confidence || 0) >= 40;
          if (!verified) {
            console.log(`Image verification failed for ${product.name}: ${verification.issues?.join(', ') || 'low confidence'}`);
          }
        } catch {
          // If we cannot verify the image, keep the current one rather than risk a wrong photo.
          verified = false;
        }

        if (verified) {
          await storage.updateProductImage(productId, imageInfo.officialImageUrl);
          cache.invalidate(`product:${productId}`);
          cache.invalidatePattern('drops:');

          await db.insert(refreshLogs).values({
            productId,
            refreshType: 'image',
            status: 'success',
            message: `Found verified image from ${imageInfo.source}`
          });

          res.json({
            success: true,
            imageUrl: imageInfo.officialImageUrl,
            source: imageInfo.source,
            verified: true
          });
        } else {
          // Image found but not verified — keep the existing image untouched.
          await db.insert(refreshLogs).values({
            productId,
            refreshType: 'image',
            status: 'failed',
            message: `Image from ${imageInfo.source} failed verification`
          });

          res.json({ success: false, message: "Found an image but could not verify it matches the product; kept the current image" });
        }
      } else {
        // No image found — keep the current image; the client renders a branded fallback if it fails to load.
        res.json({ success: false, message: "No official image found; kept the current image" });
      }
    } catch (error) {
      console.error("Error refreshing image:", error);
      res.status(500).json({ error: "Failed to refresh image" });
    }
  });

  // Refresh prices for a product from the live price fetcher. Reports honestly:
  // if no live source is available, nothing is changed and the response says so.
  app.post("/api/products/:id/refresh-prices", isAuthenticated, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const lastChecked = product.offers
      .map((o) => o.lastUpdated)
      .filter((d): d is Date => !!d)
      .sort((x, y) => new Date(y).getTime() - new Date(x).getTime())[0] ?? null;

    if (!isPriceFetcherConfigured()) {
      return res.json({ success: false, updated: 0, message: "Live prices are not available yet", lastChecked });
    }
    if (isFresh(lastChecked, 30 * 60 * 1000)) {
      return res.json({ success: true, updated: 0, cached: true, message: "Prices were checked recently", lastChecked });
    }

    let updated = 0;
    try {
      updated = await updateProductPricesFromFetch(productId);
    } catch (error) {
      console.error("Live price fetch failed:", error);
    }

    await db.insert(refreshLogs).values({
      productId,
      refreshType: "prices",
      status: updated > 0 ? "success" : "failed",
      message: updated > 0 ? `Updated ${updated} offers from live prices` : "No live prices returned",
    });

    if (updated > 0) {
      cache.invalidate(`product:${productId}`);
      cache.invalidatePattern("drops:");
    }

    res.json({
      success: updated > 0,
      updated,
      message: updated > 0 ? `Updated ${updated} prices` : "Could not get live prices right now",
      lastChecked: updated > 0 ? new Date().toISOString() : lastChecked,
    });
  });

  // Refresh all data for a product (influencers + image)
  app.post("/api/products/:id/refresh-all", isAdmin, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    try {
      // Parallel refresh of influencers and image
      const [influencers, imageInfo] = await Promise.all([
        searchInfluencersForProduct(product.name, product.brand, product.country),
        searchProductImage(product.name, product.brand, product.category)
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
  app.post("/api/refresh-trending", isAdmin, async (req, res) => {
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
  app.post("/api/refresh-images", isAdmin, async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const results: { productId: number; name: string; status: string; imageUrl?: string }[] = [];

      for (const product of allProducts) {
        try {
          // Only skip if image looks like a real product image (not a placeholder or stock photo)
          const isPlaceholder = !product.imageUrl
            || product.imageUrl.includes('unsplash.com')
            || product.imageUrl.includes('placehold.co');
          if (!isPlaceholder) {
            results.push({
              productId: product.id,
              name: product.name,
              status: 'Skipped (already has product image)'
            });
            continue;
          }

          const imageInfo = await searchProductImage(product.name, product.brand, product.category);

          if (imageInfo && imageInfo.officialImageUrl) {
            await storage.updateProductImage(product.id, imageInfo.officialImageUrl);
            cache.invalidate(`product:${product.id}`);

            results.push({
              productId: product.id,
              name: product.name,
              status: `Updated from ${imageInfo.source}`,
              imageUrl: imageInfo.officialImageUrl
            });
          } else {
            // Set a branded placeholder instead of keeping Unsplash
            const placeholder = getPlaceholderImage(product.brand, product.name);
            await storage.updateProductImage(product.id, placeholder);

            results.push({
              productId: product.id,
              name: product.name,
              status: 'No image found — placeholder set'
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

  // Image proxy: fetches allowlisted product photos server-side (retailer CDNs block hot-linking).
  app.get("/api/image-proxy", handleImageProxy);

  // Discussions route - find Reddit/forum discussions about a product
  app.get("/api/products/:id/discussions", async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });

    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Check if we have trust score data with Reddit sources
    const trustScore = await storage.getTrustScore(productId);
    if (trustScore && trustScore.redditSources && (trustScore.redditSources as string[]).length > 0) {
      return res.json({
        exists: true,
        discussions: (trustScore.redditSources as string[]).map((source: string) => ({
          title: source,
          url: source.startsWith('http') ? source : null,
          platform: 'reddit',
        })),
        sentimentScore: trustScore.redditSentimentScore,
        mentionCount: trustScore.redditMentions,
      });
    }

    return res.json({ exists: false, discussions: [] });
  });

  // Trust Score Routes
  app.get("/api/products/:id/trust-score", async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const trustScore = await storage.getTrustScore(productId);
    
    if (!trustScore) {
      return res.json({ exists: false, message: "No trust score calculated yet" });
    }
    
    const label = getTrustLabel(trustScore.trustScore);
    res.json({
      exists: true,
      ...trustScore,
      label: label.label,
      color: label.color
    });
  });

  app.post("/api/products/:id/calculate-trust-score", isAuthenticated, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existingScore = await storage.getTrustScore(productId);
    if (existingScore && isFresh(existingScore.lastCalculated, ENRICHMENT_TTL.trustScore) && !(await isAdminUser(getUserId(req)))) {
      const label = getTrustLabel(existingScore.trustScore);
      return res.json({ success: true, cached: true, trustScore: existingScore, label: label.label, color: label.color });
    }

    try {
      const trustScoreData = await generateProductTrustScore(product);
      const savedScore = await storage.upsertTrustScore(trustScoreData);
      const label = getTrustLabel(savedScore.trustScore);
      
      res.json({
        success: true,
        trustScore: savedScore,
        label: label.label,
        color: label.color
      });
    } catch (error) {
      console.error("Error calculating trust score:", error);
      res.status(500).json({ error: "Failed to calculate trust score" });
    }
  });

  // Review Summary Routes
  app.get("/api/products/:id/review-summary", async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const summary = await storage.getReviewSummary(productId);

    if (!summary) {
      return res.json({ exists: false, message: "No review summary generated yet" });
    }

    res.json({ exists: true, ...summary });
  });

  app.post("/api/products/:id/generate-review-summary", isAuthenticated, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existingSummary = await storage.getReviewSummary(productId);
    if (existingSummary && isFresh(existingSummary.generatedAt, ENRICHMENT_TTL.reviewSummary) && !(await isAdminUser(getUserId(req)))) {
      return res.json({ success: true, cached: true, reviewSummary: existingSummary });
    }

    try {
      const summaryData = await generateProductReviewSummary(product);
      const savedSummary = await storage.upsertReviewSummary(summaryData);
      
      res.json({
        success: true,
        reviewSummary: savedSummary
      });
    } catch (error) {
      console.error("Error generating review summary:", error);
      res.status(500).json({ error: "Failed to generate review summary" });
    }
  });

  // Price Tracker Routes
  app.get("/api/price-trackers", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    
    const trackers = await storage.getUserPriceTrackers(userId);
    res.json(trackers);
  });

  app.post("/api/products/:id/price-tracker", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const priceTrackerInput = z.object({
      targetPrice: z.number().positive().nullable().optional(),
      notifyOnAnyDrop: z.boolean().optional(),
    }).safeParse(req.body);
    if (!priceTrackerInput.success) {
      return res.status(400).json({ error: priceTrackerInput.error.errors[0].message });
    }
    const { targetPrice, notifyOnAnyDrop } = priceTrackerInput.data;
    
    const existing = await storage.getPriceTracker(userId, productId);
    if (existing) {
      return res.status(400).json({ error: "Already tracking this product" });
    }
    
    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const prices = product.offers.map((o) => o.price).filter((p) => p > 0);

    const tracker = await storage.createPriceTracker({
      userId,
      productId,
      targetPrice: targetPrice || null,
      notifyOnAnyDrop: notifyOnAnyDrop ?? true,
      isActive: true,
      baselinePrice: prices.length > 0 ? Math.min(...prices) : null,
    });
    
    res.status(201).json(tracker);
  });

  app.delete("/api/price-trackers/:id", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    // Verify the tracker belongs to the requesting user
    const trackerId = parseProductId(req.params.id);
    if (!trackerId) return res.status(400).json({ error: "Invalid tracker ID" });
    const userTrackers = await storage.getUserPriceTrackers(userId);
    const ownsTracker = userTrackers.some(t => t.id === trackerId);
    if (!ownsTracker) {
      return res.status(403).json({ error: "Not authorized to delete this tracker" });
    }

    await storage.deletePriceTracker(trackerId);
    res.json({ success: true });
  });

  app.get("/api/products/:id/price-history", async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 30, 1), 365);
    const history = await storage.getPriceHistory(productId, limit);
    res.json(history);
  });

  // Image Verification Route
  app.post("/api/products/:id/verify-image", isAdmin, async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });
    const product = await storage.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (!product.imageUrl) {
      return res.status(400).json({ error: "Product has no image to verify" });
    }

    try {
      const verification = await verifyProductImage(product, product.imageUrl);
      res.json({
        success: true,
        verification
      });
    } catch (error) {
      console.error("Error verifying image:", error);
      res.status(500).json({ error: "Failed to verify image" });
    }
  });

  // Smart Deep Link Route
  app.get("/api/smart-link", async (req, res) => {
    const { retailer, url } = req.query;

    if (!retailer || !url) {
      return res.status(400).json({ error: "Missing retailer or url parameter" });
    }

    // Validate URL to prevent injection attacks
    try {
      const parsed = new URL(url as string);
      const allowedHosts = [
        'www.sephora.com', 'www.ulta.com', 'www.amazon.com', 'www.amazon.in',
        'www.nykaa.com', 'www.purplle.com', 'www.myntra.com', 'www.tatacliq.com',
        'www.sephora.in', 'sephora.com', 'ulta.com', 'amazon.com', 'amazon.in',
        'nykaa.com', 'purplle.com', 'myntra.com', 'tatacliq.com', 'sephora.in'
      ];
      if (!allowedHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) {
        return res.status(400).json({ error: "URL domain not allowed" });
      }
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const userAgent = req.headers['user-agent'] || '';
    const smartLink = generateSmartLink(
      retailer as string,
      url as string,
      userAgent
    );

    res.json({ smartLink });
  });

  // Redirect with smart deep link
  app.get("/api/go/:offerId", async (req, res) => {
    try {
      const offerId = parseProductId(req.params.offerId);
      if (!offerId) return res.redirect("/");

      const [offer] = await db.select().from(productOffers).where(eq(productOffers.id, offerId));
      if (!offer) {
        return res.redirect("/");
      }

      await storage.trackClick({ productId: offer.productId, retailerId: offer.retailerId, userId: getUserId(req) });

      const [retailer] = await db.select().from(retailers).where(eq(retailers.id, offer.retailerId));
      if (!retailer) {
        return res.redirect(offer.affiliateUrl);
      }

      const userAgent = req.headers['user-agent'] || '';
      const smartLink = generateSmartLink(retailer.name, offer.affiliateUrl, userAgent);
      
      res.redirect(smartLink);
    } catch (error) {
      console.error("Smart link redirect error:", error);
      res.redirect('/');
    }
  });

  // Weekly Digest Routes
  app.get("/api/weekly-digest", async (req, res) => {
    try {
      const country = req.query.country as string | undefined;
      const digest = await generateWeeklyDigest(country);
      res.json(digest);
    } catch (error) {
      console.error("Error generating weekly digest:", error);
      res.status(500).json({ error: "Failed to generate weekly digest" });
    }
  });

  app.get("/api/weekly-digest/latest", async (req, res) => {
    try {
      const digest = await getLatestDigest();
      if (!digest) {
        return res.json({ exists: false, message: "No digest available yet" });
      }
      res.json({ exists: true, ...digest });
    } catch (error) {
      console.error("Error fetching latest digest:", error);
      res.status(500).json({ error: "Failed to fetch digest" });
    }
  });

  app.post("/api/weekly-digest/generate", isAdmin, async (req, res) => {
    try {
      const country = req.body.country as string | undefined;
      const digest = await saveWeeklyDigest(country);
      res.json({ success: true, digest });
    } catch (error) {
      console.error("Error saving weekly digest:", error);
      res.status(500).json({ error: "Failed to save digest" });
    }
  });

  // Price Fetcher Integration Routes (Python Service)
  app.post("/api/prices/fetch", isAdmin, async (req, res) => {
    try {
      const priceFetchInput = z.object({
        productName: z.string().min(1, "productName is required"),
        brand: z.string().optional(),
        retailers: z.array(z.string()).optional(),
      }).safeParse(req.body);
      if (!priceFetchInput.success) {
        return res.status(400).json({ error: priceFetchInput.error.errors[0].message });
      }
      const { productName, brand, retailers } = priceFetchInput.data;

      const prices = await fetchProductPrices(productName, brand, retailers);
      res.json({ success: true, prices });
    } catch (error) {
      console.error("Price fetch error:", error);
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  app.post("/api/prices/refresh", isAdmin, async (req, res) => {
    try {
      const priceRefreshInput = z.object({
        productName: z.string().min(1, "productName is required"),
        brand: z.string().optional(),
      }).safeParse(req.body);
      if (!priceRefreshInput.success) {
        return res.status(400).json({ error: priceRefreshInput.error.errors[0].message });
      }
      const { productName, brand } = priceRefreshInput.data;

      const triggered = await triggerBackgroundRefresh(productName, brand);
      res.json({ 
        success: triggered,
        message: triggered ? "Background refresh triggered" : "Failed to trigger refresh"
      });
    } catch (error) {
      console.error("Price refresh error:", error);
      res.status(500).json({ error: "Failed to trigger refresh" });
    }
  });

  app.get("/api/prices/health", async (req, res) => {
    try {
      const isHealthy = await checkPythonFetcherHealth();
      res.json({ 
        pythonFetcher: isHealthy ? "healthy" : "unavailable",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({ pythonFetcher: "error", error: String(error) });
    }
  });

  // ====== EMAIL/PASSWORD AUTH ======
  // Uses the same passport session as Google sign-in (req.login regenerates the
  // session id, preventing session fixation).
  const credentialsSchema = z.object({
    email: z.string().email().transform((e) => e.trim().toLowerCase()),
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
  });

  const startSession = (req: Request, userId: string) =>
    new Promise<void>((resolve, reject) => req.login({ id: userId }, (err) => (err ? reject(err) : resolve())));

  app.post("/api/auth/register", async (req, res) => {
    const input = credentialsSchema.extend({
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().max(100).optional(),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ error: input.error.errors[0].message });
    }

    const { email, password, firstName, lastName } = input.data;

    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(users).values({
      email,
      passwordHash,
      firstName,
      lastName: lastName || null,
    }).returning();

    await startSession(req, user.id);
    res.status(201).json({ success: true, user: { id: user.id, email: user.email, firstName: user.firstName } });
  });

  app.post("/api/auth/login", async (req, res) => {
    const input = z.object({
      email: z.string().email().transform((e) => e.trim().toLowerCase()),
      password: z.string().min(1).max(200),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ error: input.error.errors[0].message });
    }

    const { email, password } = input.data;
    const [user] = await db.select().from(users).where(eq(users.email, email));

    // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal accounts.
    const hash = user?.passwordHash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO6G3m5vYhLG1o2yXbD1C7p9nP0bQ4jWa";
    const isValid = await bcrypt.compare(password, hash);
    if (!user || !user.passwordHash || !isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await startSession(req, user.id);
    res.json({ success: true, user: { id: user.id, email: user.email, firstName: user.firstName } });
  });

  // ====== NOTIFICATIONS ======
  app.get("/api/notifications", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const userNotifications = await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json(userNotifications);
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const [result] = await db.select({ count: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    res.json({ count: result?.count || 0 });
  });

  app.post("/api/notifications/mark-read", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const parsed = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "ids must be an array of notification ids" });
    const ids = parsed.data.ids;
    if (ids && ids.length > 0) {
      await db.update(notifications)
        .set({ isRead: true })
        .where(and(inArray(notifications.id, ids), eq(notifications.userId, userId)));
    } else {
      // Mark all as read
      await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, userId));
    }
    res.json({ success: true });
  });

  // ====== ARTICLES ======
  app.get("/api/products/:id/articles", async (req, res) => {
    const productId = parseProductId(req.params.id);
    if (!productId) return res.status(400).json({ error: "Invalid product ID" });

    // Check cache first
    const cacheKey = `articles:${productId}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Check DB for recently fetched articles (within 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingArticles = await db.select().from(productArticles)
      .where(and(eq(productArticles.productId, productId), gte(productArticles.fetchedAt, oneDayAgo)));

    if (existingArticles.length > 0) {
      const result = { exists: true, articles: existingArticles };
      cache.set(cacheKey, result, CACHE_TTL.ARTICLES);
      return res.json(result);
    }

    // Fetch fresh articles
    const articles = await fetchArticlesForProduct(product.name, product.brand, product.country);

    if (articles.length > 0) {
      // Store in DB
      for (const article of articles) {
        await db.insert(productArticles).values({
          productId,
          title: article.title,
          url: article.url,
          source: article.source,
          snippet: article.snippet,
          publishedAt: article.publishedAt,
        }).onConflictDoNothing();
      }
    }

    const result = { exists: articles.length > 0, articles };
    cache.set(cacheKey, result, CACHE_TTL.ARTICLES);
    res.json(result);
  });

  // ====== PRODUCT COMPARISON ======
  app.post("/api/compare", async (req, res) => {
    const input = z.object({
      productIds: z.array(z.number().int().positive()).min(2).max(4),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ error: "Provide 2-4 product IDs to compare" });
    }

    const productsData = [];
    for (const pid of input.data.productIds) {
      const product = await storage.getProduct(pid);
      if (!product) {
        return res.status(404).json({ error: `Product ${pid} not found` });
      }

      const trustScore = await storage.getTrustScore(pid);
      const reviewSummary = await storage.getReviewSummary(pid);

      productsData.push({
        ...product,
        trustScore: trustScore ? {
          score: trustScore.trustScore,
          label: getTrustLabel(trustScore.trustScore).label,
          redditMentions: trustScore.redditMentions,
        } : null,
        reviewSummary: reviewSummary ? {
          summaryText: reviewSummary.summaryText,
          prosHighlights: reviewSummary.prosHighlights,
          consHighlights: reviewSummary.consHighlights,
          climateSuitability: reviewSummary.climateSuitability,
          skinTypeMatch: reviewSummary.skinTypeMatch,
        } : null,
      });
    }

    res.json({ products: productsData });
  });

  app.post("/api/comparisons/save", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const input = z.object({
      productIds: z.array(z.number().int().positive()).min(2).max(4),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ error: "Provide 2-4 product IDs" });
    }

    const [comparison] = await db.insert(comparisons).values({
      userId,
      productIds: input.data.productIds,
    }).returning();

    res.status(201).json(comparison);
  });

  // ====== ANALYTICS DASHBOARD ======
  app.get("/api/analytics/clicks", isAdmin, async (req, res) => {
    const days = Math.min(Math.max(Math.trunc(Number(req.query.days)) || 30, 1), 365);
    const cacheKey = `analytics:clicks:${days}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Total clicks
    const [totalResult] = await db.select({ count: count() }).from(clicks)
      .where(gte(clicks.clickedAt, since));

    // Clicks by product (top 10)
    const clicksByProduct = await db
      .select({
        productId: clicks.productId,
        productName: products.name,
        brand: products.brand,
        clickCount: count(),
      })
      .from(clicks)
      .innerJoin(products, eq(clicks.productId, products.id))
      .where(gte(clicks.clickedAt, since))
      .groupBy(clicks.productId, products.name, products.brand)
      .orderBy(desc(count()))
      .limit(10);

    // Clicks by retailer
    const clicksByRetailer = await db
      .select({
        retailerId: clicks.retailerId,
        retailerName: retailers.name,
        clickCount: count(),
      })
      .from(clicks)
      .innerJoin(retailers, eq(clicks.retailerId, retailers.id))
      .where(gte(clicks.clickedAt, since))
      .groupBy(clicks.retailerId, retailers.name)
      .orderBy(desc(count()));

    // Clicks by day (last 30 days)
    const clicksByDay = await db
      .select({
        day: sql<string>`DATE(${clicks.clickedAt})`.as('day'),
        clickCount: count(),
      })
      .from(clicks)
      .where(gte(clicks.clickedAt, since))
      .groupBy(sql`DATE(${clicks.clickedAt})`)
      .orderBy(sql`DATE(${clicks.clickedAt})`);

    const result = {
      totalClicks: totalResult?.count || 0,
      period: `${days} days`,
      topProducts: clicksByProduct,
      byRetailer: clicksByRetailer,
      byDay: clicksByDay,
    };

    cache.set(cacheKey, result, CACHE_TTL.ANALYTICS);
    res.json(result);
  });

  app.get("/api/analytics/overview", isAdmin, async (req, res) => {
    const cacheKey = `analytics:overview`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    const [productCount] = await db.select({ count: count() }).from(products);
    const [userCount] = await db.select({ count: count() }).from(users);
    const [trackerCount] = await db.select({ count: count() }).from(priceHistory);
    const [favoriteCount] = await db.select({ count: count() }).from(favorites);

    // Recent clicks (24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentClicks] = await db.select({ count: count() }).from(clicks)
      .where(gte(clicks.clickedAt, dayAgo));

    const result = {
      totalProducts: productCount?.count || 0,
      totalUsers: userCount?.count || 0,
      totalPriceRecords: trackerCount?.count || 0,
      totalFavorites: favoriteCount?.count || 0,
      clicksLast24h: recentClicks?.count || 0,
    };

    cache.set(cacheKey, result, CACHE_TTL.ANALYTICS);
    res.json(result);
  });

  // Cache invalidation endpoint
  app.post("/api/cache/invalidate", isAdmin, async (req, res) => {
    const { pattern } = req.body;
    if (pattern) {
      cache.invalidatePattern(pattern);
    } else {
      cache.invalidatePattern(""); // clear all
    }
    res.json({ success: true, stats: cache.stats() });
  });

  // Scheduled jobs. Vercel Cron calls these with `Authorization: Bearer $CRON_SECRET`.
  app.get("/api/cron/price-check", async (req, res) => {
    if (!isValidCronRequest(req.headers.authorization, process.env.CRON_SECRET)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await checkPricesForAllTrackers();
    res.json({ success: true, ...result });
  });

  return httpServer;
}
