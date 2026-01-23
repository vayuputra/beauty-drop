import type { Product, ProductTrustScore, InsertTrustScore } from "@shared/schema";

interface RedditSentimentResult {
  overallSentiment: number; // 0-100, where 50 is neutral
  mentionCount: number;
  sources: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
}

interface EngagementMetrics {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
}

interface EngagementAuthenticityResult {
  score: number; // 0-100
  suspiciousIndicators: string[];
  platformBreakdown: { platform: string; score: number }[];
}

const REDDIT_SUBREDDITS = {
  IN: ['IndianSkincareAddicts', 'IndianMakeupAddicts', 'AsianBeauty', 'IndianBeauty'],
  US: ['SkincareAddiction', 'MakeupAddiction', 'AsianBeauty', 'BeautyGuruChatter', 'Sephora']
};

export async function analyzeRedditSentiment(
  productName: string,
  brand: string,
  country: string
): Promise<RedditSentimentResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    console.error("PERPLEXITY_API_KEY not set for Reddit sentiment analysis");
    return {
      overallSentiment: 50,
      mentionCount: 0,
      sources: [],
      positiveKeywords: [],
      negativeKeywords: []
    };
  }

  const subreddits = REDDIT_SUBREDDITS[country as keyof typeof REDDIT_SUBREDDITS] || REDDIT_SUBREDDITS.US;
  const subredditList = subreddits.map(s => `r/${s}`).join(', ');

  const prompt = `Analyze Reddit discussions about "${productName}" by ${brand} in beauty/skincare communities.
Search specifically in these subreddits: ${subredditList}

Provide a sentiment analysis with:
1. Overall sentiment score (0-100, where 0 is very negative, 50 is neutral, 100 is very positive)
2. Number of Reddit mentions/discussions found
3. List of Reddit post URLs or thread titles discussing this product
4. Key positive themes mentioned by users
5. Key negative/concerns mentioned by users

Return as JSON with this structure:
{
  "overallSentiment": number,
  "mentionCount": number,
  "sources": ["url or thread title"],
  "positiveKeywords": ["keyword1", "keyword2"],
  "negativeKeywords": ["concern1", "concern2"]
}

Only return the JSON, no other text.`;

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
            content: "You are a beauty product sentiment analysis expert. Search Reddit discussions and analyze user opinions. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        search_recency_filter: "year",
        return_images: false,
        stream: false
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error for Reddit sentiment:", response.status);
      return {
        overallSentiment: 50,
        mentionCount: 0,
        sources: [],
        positiveKeywords: [],
        negativeKeywords: []
      };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";
    
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const result = JSON.parse(jsonStr);
    return {
      overallSentiment: Math.min(100, Math.max(0, result.overallSentiment || 50)),
      mentionCount: result.mentionCount || 0,
      sources: result.sources || [],
      positiveKeywords: result.positiveKeywords || [],
      negativeKeywords: result.negativeKeywords || []
    };
  } catch (error) {
    console.error("Error analyzing Reddit sentiment:", error);
    return {
      overallSentiment: 50,
      mentionCount: 0,
      sources: [],
      positiveKeywords: [],
      negativeKeywords: []
    };
  }
}

export function calculateEngagementAuthenticity(
  metrics: EngagementMetrics[]
): EngagementAuthenticityResult {
  const suspiciousIndicators: string[] = [];
  const platformBreakdown: { platform: string; score: number }[] = [];
  
  let totalScore = 0;
  let validPlatforms = 0;

  for (const metric of metrics) {
    let platformScore = 100;
    
    if (metric.views > 0) {
      const likeRatio = metric.likes / metric.views;
      const commentRatio = metric.comments / metric.views;
      
      if (likeRatio > 0.3) {
        platformScore -= 30;
        suspiciousIndicators.push(`${metric.platform}: Unusually high like ratio (${(likeRatio * 100).toFixed(1)}%)`);
      }
      
      if (likeRatio < 0.001 && metric.views > 10000) {
        platformScore -= 20;
        suspiciousIndicators.push(`${metric.platform}: Very low engagement for view count`);
      }
      
      if (commentRatio > 0.1) {
        platformScore -= 15;
        suspiciousIndicators.push(`${metric.platform}: Comment ratio seems artificial`);
      }
      
      if (metric.likes > 0 && metric.comments === 0) {
        platformScore -= 25;
        suspiciousIndicators.push(`${metric.platform}: Likes but no comments (potential bot activity)`);
      }
      
      if (metric.views > 1000000 && metric.comments < 100) {
        platformScore -= 35;
        suspiciousIndicators.push(`${metric.platform}: Viral views with minimal comments`);
      }
    }
    
    platformScore = Math.max(0, Math.min(100, platformScore));
    platformBreakdown.push({ platform: metric.platform, score: platformScore });
    totalScore += platformScore;
    validPlatforms++;
  }

  const averageScore = validPlatforms > 0 ? Math.round(totalScore / validPlatforms) : 50;
  
  return {
    score: averageScore,
    suspiciousIndicators,
    platformBreakdown
  };
}

export function calculateTrustScore(
  redditSentiment: RedditSentimentResult,
  engagementAuthenticity: EngagementAuthenticityResult
): number {
  const REDDIT_WEIGHT = 0.70;
  const ENGAGEMENT_WEIGHT = 0.30;
  
  let redditScore = redditSentiment.overallSentiment;
  
  if (redditSentiment.mentionCount >= 10) {
    redditScore = Math.min(100, redditScore + 10);
  } else if (redditSentiment.mentionCount >= 5) {
    redditScore = Math.min(100, redditScore + 5);
  } else if (redditSentiment.mentionCount === 0) {
    redditScore = 50;
  }
  
  const weightedScore = (redditScore * REDDIT_WEIGHT) + 
                       (engagementAuthenticity.score * ENGAGEMENT_WEIGHT);
  
  return Math.round(Math.min(100, Math.max(1, weightedScore)));
}

export function getTrustLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Highly Trusted", color: "green" };
  if (score >= 60) return { label: "Trusted", color: "emerald" };
  if (score >= 40) return { label: "Mixed Reviews", color: "yellow" };
  if (score >= 20) return { label: "Use Caution", color: "orange" };
  return { label: "Red Flags", color: "red" };
}

export async function generateProductTrustScore(
  product: Product,
  engagementMetrics: EngagementMetrics[] = []
): Promise<InsertTrustScore> {
  const redditSentiment = await analyzeRedditSentiment(
    product.name,
    product.brand,
    product.country
  );
  
  const engagementAuthenticity = calculateEngagementAuthenticity(engagementMetrics);
  
  const trustScore = calculateTrustScore(redditSentiment, engagementAuthenticity);
  
  return {
    productId: product.id,
    trustScore,
    redditSentimentScore: redditSentiment.overallSentiment,
    engagementAuthenticityScore: engagementAuthenticity.score,
    redditMentions: redditSentiment.mentionCount,
    redditSources: redditSentiment.sources.slice(0, 10)
  };
}
