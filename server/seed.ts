import { db } from "./db";
import { isNull, sql } from "drizzle-orm";
import { products, productOffers } from "@shared/schema";
import { findOrCreateRetailer } from "./ingest/store";
import { resolveProductImage } from "./services/perplexity";

/**
 * DEMO DATA — local development only.
 *
 * Prices here are illustrative placeholders (one base price scaled per retailer)
 * and offer links are retailer search pages. They are NOT live prices and must
 * never be seeded into production; real offers come from the price ingestion
 * pipeline. Run with `npm run db:seed`.
 */
export async function seedDatabase() {
  // Demo products are the ones not created by an ingestion source.
  const [{ demoCount }] = await db
    .select({ demoCount: sql<number>`count(*)::int` })
    .from(products)
    .where(isNull(products.sourceKey));
  if (demoCount === 0) {
    console.log("Seeding Database...");
    
    // Create Retailers
    const sephora = await findOrCreateRetailer({ name: "Sephora", country: "US" });

    const ulta = await findOrCreateRetailer({ name: "Ulta Beauty", country: "US" });

    const nykaa = await findOrCreateRetailer({ name: "Nykaa", country: "IN" });

    const purplle = await findOrCreateRetailer({ name: "Purplle", country: "IN" });

    // Additional India retailers for monetization
    const amazonIn = await findOrCreateRetailer({ name: "Amazon India", country: "IN" });

    const myntra = await findOrCreateRetailer({ name: "Myntra", country: "IN" });

    const tataCliq = await findOrCreateRetailer({ name: "Tata CLiQ", country: "IN" });

    const sephoraIn = await findOrCreateRetailer({ name: "Sephora India", country: "IN" });

    // Additional US retailers
    const amazonUs = await findOrCreateRetailer({ name: "Amazon", country: "US" });

    // US demo products
    const usProductData = [
      {
        name: "Soft Pinch Liquid Blush",
        brand: "Rare Beauty",
        category: "Makeup",
        country: "US",
        description: "A weightless, long-lasting liquid blush that blends and builds beautifully for a soft, healthy flush.",
        imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600",
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
        imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600",
        whyTrending: "90s nostalgia comeback! The OG universally flattering lip color.",
        tags: { priceBand: "mid", finish: "sheer" },
        price: 22.00,
        currency: "USD"
      },
      {
        name: "Watermelon Glow Dew Drops",
        brand: "Glow Recipe",
        category: "Skincare",
        country: "US",
        description: "Hyaluronic acid serum with watermelon, vitamin E, and light-reflecting pigments for instant glow.",
        imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
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
        imageUrl: "https://images.unsplash.com/photo-1631214540553-ff044a3ff1d4?w=600",
        whyTrending: "Drugstore mascara that rivals luxury! 10M+ TikTok views.",
        tags: { priceBand: "budget", finish: "dramatic" },
        price: 13.99,
        currency: "USD"
      },
      {
        name: "Brazilian Bum Bum Cream",
        brand: "Sol de Janeiro",
        category: "Body",
        country: "US",
        description: "Fast-absorbing body cream with cupuacu butter and coconut oil for silky skin.",
        imageUrl: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600",
        whyTrending: "The iconic Brazilian scent everyone is obsessed with!",
        tags: { priceBand: "high", finish: "smooth" },
        price: 48.00,
        currency: "USD"
      },
      {
        name: "Lip Butter Balm",
        brand: "Summer Fridays",
        category: "Makeup",
        country: "US",
        description: "Silky smooth lip balm with shea and murumuru seed butter for instant hydration.",
        imageUrl: "https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?w=600",
        whyTrending: "TikTok's favorite lip product! Clean ingredients, maximum hydration.",
        tags: { priceBand: "mid", finish: "glossy" },
        price: 24.00,
        currency: "USD"
      },
      {
        name: "Snail Mucin 96% Power Essence",
        brand: "COSRX",
        category: "Skincare",
        country: "US",
        description: "Lightweight essence with 96% snail secretion filtrate for deep hydration and skin repair.",
        imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
        whyTrending: "K-beauty cult favorite! 100M+ bottles sold worldwide.",
        tags: { priceBand: "budget", finish: "hydrating" },
        price: 25.00,
        currency: "USD"
      },
      {
        name: "Cloud Paint",
        brand: "Glossier",
        category: "Makeup",
        country: "US",
        description: "Seamless, buildable gel-cream blush for a natural, flushed-from-within look.",
        imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600",
        whyTrending: "The internet's favorite blush! So easy to apply.",
        tags: { priceBand: "mid", finish: "natural" },
        price: 20.00,
        currency: "USD"
      },
      {
        name: "Retinol 0.5 Treatment",
        brand: "The Ordinary",
        category: "Skincare",
        country: "US",
        description: "Pure retinol serum for reducing fine lines and improving skin texture.",
        imageUrl: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
        whyTrending: "Affordable retinol that actually works! Dermatologist approved.",
        tags: { priceBand: "budget", finish: "anti-aging" },
        price: 8.90,
        currency: "USD"
      },
    ];

    // India demo products
    const inProductData = [
      {
        name: "Matte Drama Long Stay Lipstick",
        brand: "Kay Beauty",
        category: "Makeup",
        country: "IN",
        description: "Long stay matte lipstick enriched with vitamin E for comfortable wear.",
        imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600",
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
        imageUrl: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
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
        imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600",
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
        imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600",
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
        imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
        whyTrending: "K-beauty meets Ayurveda! Vegan and cruelty-free.",
        tags: { priceBand: "mid", finish: "brightening" },
        price: 699.00,
        currency: "INR"
      },
      {
        name: "Vitamin C 10% Face Serum",
        brand: "Minimalist",
        category: "Skincare",
        country: "IN",
        description: "Ethyl ascorbic acid with ferulic acid for bright, even-toned skin.",
        imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
        whyTrending: "Affordable vitamin C that actually works! Pharmacy-grade ingredients.",
        tags: { priceBand: "budget", finish: "brightening" },
        price: 545.00,
        currency: "INR"
      },
      {
        name: "Colossal Kajal 24Hr",
        brand: "Maybelline",
        category: "Makeup",
        country: "IN",
        description: "Smudge-proof, waterproof kajal for intense black definition that lasts all day.",
        imageUrl: "https://images.unsplash.com/photo-1631214540553-ff044a3ff1d4?w=600",
        whyTrending: "India's favorite kajal! Perfect for humid weather.",
        tags: { priceBand: "budget", finish: "matte" },
        price: 325.00,
        currency: "INR"
      },
      {
        name: "Sunscreen SPF 50 PA++++",
        brand: "Dot & Key",
        category: "Skincare",
        country: "IN",
        description: "Lightweight, non-greasy sunscreen with vitamin C for daily protection.",
        imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600",
        whyTrending: "Finally a sunscreen that doesn't leave white cast on Indian skin!",
        tags: { priceBand: "mid", finish: "matte" },
        price: 695.00,
        currency: "INR"
      },
      {
        name: "Compact Powder SPF 15",
        brand: "Lakme",
        category: "Makeup",
        country: "IN",
        description: "Silky smooth compact with built-in sunscreen for flawless matte finish.",
        imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600",
        whyTrending: "India's OG compact! Perfect for on-the-go touch ups.",
        tags: { priceBand: "budget", finish: "matte" },
        price: 295.00,
        currency: "INR"
      },
      {
        name: "Salicylic Acid 2% Face Serum",
        brand: "Minimalist",
        category: "Skincare",
        country: "IN",
        description: "BHA serum for acne-prone skin, helps unclog pores and reduce breakouts.",
        imageUrl: "https://images.unsplash.com/photo-1617897903246-719242758050?w=600",
        whyTrending: "Best affordable BHA serum in India! Dermat recommended.",
        tags: { priceBand: "budget", finish: "clarifying" },
        price: 549.00,
        currency: "INR"
      },
      {
        name: "Liquid Lipstick Matte",
        brand: "Sugar Cosmetics",
        category: "Makeup",
        country: "IN",
        description: "Long-lasting matte liquid lipstick with intense pigmentation.",
        imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600",
        whyTrending: "Homegrown brand loved for bold Indian shades!",
        tags: { priceBand: "mid", finish: "matte" },
        price: 799.00,
        currency: "INR"
      },
      {
        name: "Green Tea Night Gel",
        brand: "Plum",
        category: "Skincare",
        country: "IN",
        description: "Oil-free night gel with green tea extracts for acne control and hydration.",
        imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600",
        whyTrending: "100% vegan and cruelty-free! Perfect for oily skin.",
        tags: { priceBand: "mid", finish: "hydrating" },
        price: 575.00,
        currency: "INR"
      },
    ];

    // Insert US products
    for (const prod of usProductData) {
      const [newProduct] = await db.insert(products).values({
        name: prod.name,
        brand: prod.brand,
        category: prod.category,
        country: prod.country,
        description: prod.description,
        imageUrl: resolveProductImage(prod.brand, prod.name),
        whyTrending: prod.whyTrending,
        tags: prod.tags,
        influencerCount: 0
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
    }

    // Insert India products
    for (const prod of inProductData) {
      const [newProduct] = await db.insert(products).values({
        name: prod.name,
        brand: prod.brand,
        category: prod.category,
        country: prod.country,
        description: prod.description,
        imageUrl: resolveProductImage(prod.brand, prod.name),
        whyTrending: prod.whyTrending,
        tags: prod.tags,
        influencerCount: 0
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
    }

    // Demo prices were never observed from a retailer, so don't let them look freshly checked.
    await db.update(productOffers).set({ lastUpdated: null });

    console.log("Database seeded successfully!");
  }
}
