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

    const influencers: InfluencerInfo[] = JSON.parse(jsonStr);
    
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

export async function searchProductImage(
  productName: string,
  brand: string
): Promise<ProductImageInfo | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("PERPLEXITY_API_KEY not set");
    return null;
  }

  const prompt = `Find the official product image URL for "${productName}" by ${brand} from the brand's official website or major retailers like Sephora, Ulta, Nykaa.

Return ONLY a JSON object with:
- officialImageUrl: Direct URL to the product image (must be a valid image URL ending in .jpg, .png, .webp, or from a CDN like images-static.nykaa.com, sephora.com/productimages, etc.)
- source: The source website name

Return only the JSON object, no other text.`;

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
            content: "You are a product research assistant. Return only valid JSON with image URLs. No markdown, no explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        search_recency_filter: "month",
        return_images: true,
        stream: false
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status);
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

    const result: ProductImageInfo = JSON.parse(jsonStr);
    return result;
  } catch (error) {
    console.error("Error searching product image:", error);
    return null;
  }
}

