import OpenAI from "openai";
import type { Product, InsertReviewSummary } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface ReviewSource {
  platform: string;
  reviewCount: number;
}

interface ReviewSynthesisResult {
  summaryText: string;
  climateSuitability: string;
  skinTypeMatch: string;
  prosHighlights: string[];
  consHighlights: string[];
  sources: ReviewSource[];
}

const CLIMATE_ZONES = {
  IN: ['humid tropical', 'dry summer', 'monsoon', 'Delhi winters', 'coastal humid', 'hot and dusty'],
  US: ['dry desert', 'humid subtropical', 'cold winters', 'mild coastal', 'hot summers', 'humid continental']
};

export async function synthesizeProductReviews(
  product: Product,
  additionalContext?: string
): Promise<ReviewSynthesisResult> {
  const climateZones = CLIMATE_ZONES[product.country as keyof typeof CLIMATE_ZONES] || CLIMATE_ZONES.US;
  
  const systemPrompt = `You are a beauty product review analyst. Synthesize reviews and provide actionable insights for consumers. 
Be honest about both positives and negatives. Focus on practical advice based on real user experiences.
Consider climate suitability and skin type compatibility in your analysis.`;

  const userPrompt = `Analyze reviews and user feedback for this beauty product:

Product: ${product.name}
Brand: ${product.brand}
Category: ${product.category}
Country: ${product.country}
Description: ${product.description || 'No description available'}
${additionalContext ? `Additional Context: ${additionalContext}` : ''}

Based on your knowledge of beauty community discussions (Reddit, YouTube, beauty blogs), provide:

1. A concise 2-3 sentence summary of the overall consensus
2. Climate suitability - specifically mention which climate conditions this product works best in (consider: ${climateZones.join(', ')})
3. Skin type match - which skin types (oily, dry, combination, sensitive, normal) this product suits best
4. Top 3-5 pros mentioned by users
5. Top 2-3 cons or concerns mentioned by users
6. Estimated source breakdown (approximate review counts from different platforms)

Return as JSON:
{
  "summaryText": "2-3 sentence consensus summary",
  "climateSuitability": "Specific climate recommendation, e.g., 'Best for humid tropical climates' or 'Performs well in Delhi winters'",
  "skinTypeMatch": "e.g., 'Ideal for oily to combination skin; may be too heavy for very oily skin'",
  "prosHighlights": ["pro1", "pro2", "pro3"],
  "consHighlights": ["con1", "con2"],
  "sources": [{"platform": "Reddit", "reviewCount": 50}, {"platform": "YouTube", "reviewCount": 25}]
}

Return only valid JSON, no other text.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const result = JSON.parse(jsonStr);
    
    return {
      summaryText: result.summaryText || "No summary available",
      climateSuitability: result.climateSuitability || "Suitable for most climates",
      skinTypeMatch: result.skinTypeMatch || "Suitable for all skin types",
      prosHighlights: result.prosHighlights || [],
      consHighlights: result.consHighlights || [],
      sources: result.sources || []
    };
  } catch (error) {
    console.error("Error synthesizing reviews:", error);
    return {
      summaryText: "Unable to generate review summary at this time.",
      climateSuitability: "Climate suitability data unavailable",
      skinTypeMatch: "Skin type match data unavailable",
      prosHighlights: [],
      consHighlights: [],
      sources: []
    };
  }
}

export async function generateProductReviewSummary(
  product: Product,
  additionalContext?: string
): Promise<InsertReviewSummary> {
  const synthesis = await synthesizeProductReviews(product, additionalContext);
  
  return {
    productId: product.id,
    summaryText: synthesis.summaryText,
    climateSuitability: synthesis.climateSuitability,
    skinTypeMatch: synthesis.skinTypeMatch,
    prosHighlights: synthesis.prosHighlights,
    consHighlights: synthesis.consHighlights,
    sources: synthesis.sources
  };
}
