/**
 * Article aggregation service using Perplexity AI.
 * Finds recent articles, blog posts, and reviews about beauty products.
 */

interface ArticleResult {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt: string | null;
}

export async function fetchArticlesForProduct(
  productName: string,
  brand: string,
  country: string
): Promise<ArticleResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("PERPLEXITY_API_KEY not set for article search");
    return [];
  }

  const regionContext = country === 'IN'
    ? 'Focus on Indian beauty publications like Vogue India, Elle India, Nykaa blog, BeautyByBabita.'
    : 'Focus on US beauty publications like Allure, Vogue, Byrdie, Glamour, Sephora blog.';

  const prompt = `Find 5-8 recent articles, blog posts, or detailed reviews about "${productName}" by ${brand}.
${regionContext}

For each article provide:
1. Title of the article
2. Direct URL to the article
3. Source/publication name
4. A 1-2 sentence snippet/summary
5. Approximate publication date (if available)

Return as a JSON array:
[{
  "title": "article title",
  "url": "https://...",
  "source": "publication name",
  "snippet": "brief summary",
  "publishedAt": "2024-01" or null
}]

Only return valid JSON array, no other text.`;

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
            content: "You are a beauty product research assistant. Find real articles and reviews. Return only valid JSON arrays. Never fabricate URLs - only return URLs you find in search results."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        search_recency_filter: "year",
        return_images: false,
        stream: false
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error for articles:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "[]";

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    let articles: ArticleResult[];
    try {
      articles = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse articles response");
      return [];
    }

    if (!Array.isArray(articles)) return [];

    return articles
      .filter(a => a.title && a.url && a.url.startsWith('http'))
      .slice(0, 8);
  } catch (error) {
    console.error("Error fetching articles:", error);
    return [];
  }
}
