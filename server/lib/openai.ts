import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Lazily creates the OpenAI client so the server can boot (and serve everything
 * else) when no key is configured; only the AI features themselves fail.
 */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI is not configured (set OPENAI_API_KEY)");
    client = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined });
  }
  return client;
}
