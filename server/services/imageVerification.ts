import OpenAI from "openai";
import type { Product } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface ImageVerificationResult {
  isAuthentic: boolean;
  confidence: number;
  matchesDescription: boolean;
  issues: string[];
  suggestedFixes: string[];
}

export async function verifyProductImage(
  product: Product,
  imageUrl: string
): Promise<ImageVerificationResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an image verification expert for beauty products. Analyze product images to verify:
1. The image matches the product description (brand, category, type)
2. The image appears to be official product photography (not user-generated)
3. There are no watermarks, inappropriate content, or quality issues
4. The product packaging matches known branding

Return JSON only.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Verify this image for the product:
Product: ${product.name}
Brand: ${product.brand}
Category: ${product.category}
Description: ${product.description || 'No description'}

Analyze the image and return JSON:
{
  "isAuthentic": boolean (true if looks like official product image),
  "confidence": number (0-100),
  "matchesDescription": boolean (true if image matches product details),
  "issues": ["list of any problems found"],
  "suggestedFixes": ["suggestions for improvement"]
}

Only return valid JSON.`
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "low"
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const result = JSON.parse(jsonStr);
    
    return {
      isAuthentic: result.isAuthentic ?? true,
      confidence: Math.min(100, Math.max(0, result.confidence || 50)),
      matchesDescription: result.matchesDescription ?? true,
      issues: result.issues || [],
      suggestedFixes: result.suggestedFixes || []
    };
  } catch (error) {
    console.error("Error verifying image:", error);
    return {
      isAuthentic: true,
      confidence: 50,
      matchesDescription: true,
      issues: ["Unable to verify image at this time"],
      suggestedFixes: []
    };
  }
}
