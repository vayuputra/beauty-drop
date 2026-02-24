function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations?: string[];
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }[];
}

interface InfluencerInfo {
  name: string;
  handle: string;
  platform: string;
  followers: string;
  videoUrl: string;
  videoTitle: string;
  thumbnailUrl?: string;
  embedUrl?: string;
}

interface ProductImageInfo {
  officialImageUrl: string;
  source: string;
}

export async function searchInfluencersForProduct(
  productName: string,
  brand: string,
  country: string
): Promise<InfluencerInfo[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("PERPLEXITY_API_KEY not set");
    return [];
  }

  const prompt = `Find the top 5 beauty influencers who have recently reviewed or talked about "${productName}" by ${brand}. 
Focus on YouTube, Instagram, and TikTok creators.
${country === 'US' ? 'Focus on US-based influencers.' : 'Focus on Indian beauty influencers.'}

For each influencer, provide:
1. Their name
2. Their social media handle (with @ symbol)
3. Platform (youtube, instagram, or tiktok)
4. Approximate follower count (e.g., "2.5M", "500K")
5. URL to their video/post about this product
6. Title of their video/post

Return the data as a JSON array with objects containing: name, handle, platform, followers, videoUrl, videoTitle.
Only return the JSON array, no other text.`;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a beauty industry research assistant. Return only valid JSON arrays with influencer data. No markdown, no explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        search_recency_filter: "month",
        return_images: false,
        stream: false
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status, await response.text());
      return [];
    }

    const data: PerplexityResponse = await response.json();
    const content = data.choices[0]?.message?.content || "[]";

    // Parse the JSON response, handling potential formatting issues
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    let influencers: InfluencerInfo[];
    try {
      influencers = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse Perplexity influencer response:", parseError, "Raw:", jsonStr.substring(0, 200));
      return [];
    }

    if (!Array.isArray(influencers)) {
      console.error("Perplexity response is not an array:", typeof influencers);
      return [];
    }

    // Add embed URLs for YouTube videos
    return influencers.map(inf => {
      let embedUrl = inf.embedUrl;
      let thumbnailUrl = inf.thumbnailUrl;

      if (inf.platform === 'youtube' && inf.videoUrl) {
        const videoId = extractYouTubeVideoId(inf.videoUrl);
        if (videoId) {
          embedUrl = `https://www.youtube.com/embed/${videoId}`;
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      }

      return {
        ...inf,
        embedUrl,
        thumbnailUrl
      };
    });
  } catch (error) {
    console.error("Error searching influencers:", error);
    return [];
  }
}

// No more generic Unsplash fallbacks — they look like real product images but aren't.
// We return null when we can't find the real image, and let the frontend show a clear placeholder.

const KNOWN_PRODUCT_IMAGES: Record<string, { url: string; source: string }> = {
  'rare beauty soft pinch liquid blush': {
    url: 'https://www.sephora.com/productimages/sku/s2514168-main-zoom.jpg',
    source: 'Sephora'
  },
  'sol de janeiro brazilian bum bum cream': {
    url: 'https://www.sephora.com/productimages/sku/s1863392-main-zoom.jpg',
    source: 'Sephora'
  },
  'clinique black honey lip balm': {
    url: 'https://www.sephora.com/productimages/sku/s1926058-main-zoom.jpg',
    source: 'Sephora'
  },
  'glow recipe watermelon glow dew drops': {
    url: 'https://www.sephora.com/productimages/sku/s2262354-main-zoom.jpg',
    source: 'Sephora'
  },
  'maybelline lash sensational sky high mascara': {
    url: 'https://www.maybelline.com/-/media/project/loreal/brand-sites/mny/americas/us/products/eye-makeup/mascara/lash-sensational-sky-high-washable-mascara/maybelline-mascara-lash-sensational-sky-high-very-black-041554578706-o.jpg',
    source: 'Maybelline'
  },
  'glossier cloud paint': {
    url: 'https://www.sephora.com/productimages/sku/s2662645-main-zoom.jpg',
    source: 'Sephora'
  },
  'cosrx snail mucin 96% power essence': {
    url: 'https://m.media-amazon.com/images/I/61D-D7D9bkL._SL1500_.jpg',
    source: 'Amazon'
  },
  'the ordinary retinol 0.5 treatment': {
    url: 'https://theordinary.com/dw/image/v2/BFKJ_PRD/on/demandware.static/-/Sites-deciem-master/default/dw95a0c2f1/Images/products/The%20Ordinary/rdn-retinol-05-in-squalane-30ml.png',
    source: 'The Ordinary'
  },
  'minimalist salicylic acid 2% face serum': {
    url: 'https://m.media-amazon.com/images/I/51S9IbhvtaL._SL1100_.jpg',
    source: 'Amazon'
  },
  'minimalist vitamin c 10% face serum': {
    url: 'https://m.media-amazon.com/images/I/51Cv+PShgjL._SL1100_.jpg',
    source: 'Amazon'
  },
  'minimalist hydra boost moisturizer': {
    url: 'https://m.media-amazon.com/images/I/51kl9cIU6BL._SL1100_.jpg',
    source: 'Amazon'
  },
  'plum rice water brightening serum': {
    url: 'https://m.media-amazon.com/images/I/51R8o6wpGxL._SL1200_.jpg',
    source: 'Amazon'
  },
  'plum green tea night gel': {
    url: 'https://m.media-amazon.com/images/I/61RiS3u8XcL._SL1200_.jpg',
    source: 'Amazon'
  },
  'sugar cosmetics liquid lipstick matte': {
    url: 'https://m.media-amazon.com/images/I/51Y3DCBWMVL._SL1500_.jpg',
    source: 'Amazon'
  },
  'lakme nude nail enamel collection': {
    url: 'https://m.media-amazon.com/images/I/71+7aK7oJqL._SL1500_.jpg',
    source: 'Amazon'
  },
  'forest essentials kumkumadi tailam face oil': {
    url: 'https://m.media-amazon.com/images/I/61E0WKRdX6L._SL1500_.jpg',
    source: 'Amazon'
  },
  'dot & key sunscreen spf 50 pa++++': {
    url: 'https://m.media-amazon.com/images/I/51Zk-vCNl-L._SL1200_.jpg',
    source: 'Amazon'
  },
  'dot & key compact powder spf 15': {
    url: 'https://m.media-amazon.com/images/I/51e6gL1aJYL._SL1200_.jpg',
    source: 'Amazon'
  },
  // Indian Market additions
  'mamaearth ubtan face wash': {
    url: 'https://images.amazon.com/images/P/B093HB4HVR.01.jpg',
    source: 'Amazon India'
  },
  'maybelline fit me foundation': {
    url: 'https://images-static.nykaa.com/media/catalog/product/a/9/a9e9d6aNYKAC00003439_1.jpg',
    source: 'Nykaa'
  },
  'lakme absolute blur perfect primer': {
    url: 'https://m.media-amazon.com/images/I/51wXkYtVzKL._SL1000_.jpg',
    source: 'Amazon India'
  },
  'nykaa so matte lipstick': {
    url: 'https://images-static.nykaa.com/media/catalog/product/5/3/5391500003920_1_1.jpg',
    source: 'Nykaa'
  },
  'neutrogena hydro boost water gel': {
    url: 'https://m.media-amazon.com/images/I/518+d3F+GqL._SL1000_.jpg',
    source: 'Amazon India'
  },
  'cetaphil gentle skin cleanser': {
    url: 'https://m.media-amazon.com/images/I/61+y+.L._SL1500_.jpg',
    source: 'Amazon India'
  },
  'summer fridays lip butter balm': {
    url: 'https://www.sephora.com/productimages/sku/s2539082-main-zoom.jpg',
    source: 'Sephora'
  },
  'kay beauty matte drama long stay lipstick': {
    url: 'https://m.media-amazon.com/images/I/51FYqBjTURL._SL1200_.jpg',
    source: 'Amazon India'
  },
  'maybelline colossal kajal 24hr': {
    url: 'https://m.media-amazon.com/images/I/51A0kPfDEjL._SL1200_.jpg',
    source: 'Amazon India'
  },
  'lakme compact powder spf 15': {
    url: 'https://m.media-amazon.com/images/I/51aL2b3pqQL._SL1200_.jpg',
    source: 'Amazon India'
  }
};

/** Returns a branded text placeholder instead of a misleading stock photo */
export function getPlaceholderImage(brand: string, name: string): string {
  const text = encodeURIComponent(`${brand}\n${name.substring(0, 30)}`);
  return `https://placehold.co/600x600/fce7f3/db2777?text=${text}`;
}

/**
 * Synchronous lookup for known product images.
 * Returns the real product image URL if we have it, otherwise a branded placeholder.
 * Used by seed data to avoid inserting random stock photos.
 */
export function resolveProductImage(brand: string, name: string): string {
  const lookupKey = `${brand.toLowerCase()} ${name.toLowerCase()}`;
  const known = KNOWN_PRODUCT_IMAGES[lookupKey];
  if (known) return known.url;

  const nameOnly = name.toLowerCase();
  const knownByName = KNOWN_PRODUCT_IMAGES[nameOnly];
  if (knownByName) return knownByName.url;

  return getPlaceholderImage(brand, name);
}

export async function searchProductImage(
  productName: string,
  brand: string,
  category?: string
): Promise<ProductImageInfo | null> {
  // First, check if we have a known image for this product
  const lookupKey = `${brand.toLowerCase()} ${productName.toLowerCase()}`;
  const knownImage = KNOWN_PRODUCT_IMAGES[lookupKey];
  if (knownImage) {
    console.log(`Using known image for ${brand} ${productName}: ${knownImage.url}`);
    return { officialImageUrl: knownImage.url, source: knownImage.source };
  }

  // Also try with just the product name
  const productOnlyKey = productName.toLowerCase();
  const knownImageByName = KNOWN_PRODUCT_IMAGES[productOnlyKey];
  if (knownImageByName) {
    console.log(`Using known image for ${productName}: ${knownImageByName.url}`);
    return { officialImageUrl: knownImageByName.url, source: knownImageByName.source };
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("PERPLEXITY_API_KEY not set — cannot search for product image");
    return null;
  }

  const prompt = `Find the official product image URL for "${productName}" by ${brand}.
 
I need the direct URL to the actual product photo (the real product packaging/bottle/tube image, NOT a stock photo).
 
Search for the image on:
1. The official ${brand} website
2. Major retailers like Sephora, Ulta, Amazon (especially Amazon.in for India), Nykaa, Myntra
3. The brand's official product pages
 
Return ONLY a JSON object with:
{
  "imageUrl": "direct URL to the product image (must be a .jpg, .png, or .webp file, or a CDN image URL)",
  "source": "website name where you found it"
}

Requirements:
- The URL must be a direct link to an image file or CDN-hosted image
- Must be the actual product photo showing the real packaging
- Prefer high-resolution images (at least 400x400 pixels)
- Do NOT return generic category images or stock photos

Return ONLY the JSON object, no other text.`;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a product research assistant. Return only valid JSON with image URLs. No markdown, no explanations. Only return direct image URLs from official sources."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        return_images: true,
        stream: false
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status, await response.text());
      return null;
    }

    const data: PerplexityResponse = await response.json();
    const content = data.choices[0]?.message?.content || "{}";

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    let result: { imageUrl?: string; source?: string };
    try {
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse Perplexity image response:", parseError, "Raw:", jsonStr.substring(0, 200));
      return null;
    }

    if (result.imageUrl && typeof result.imageUrl === 'string' && result.imageUrl.startsWith('http')) {
      console.log(`Found product image for ${brand} ${productName}: ${result.imageUrl}`);
      return {
        officialImageUrl: result.imageUrl,
        source: result.source || 'Web Search'
      };
    }

    console.log(`No valid image found for ${brand} ${productName}`);
    return null;
  } catch (error) {
    console.error("Error searching product image:", error);
    return null;
  }
}

