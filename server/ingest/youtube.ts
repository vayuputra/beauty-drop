import { fetchJson } from "./http";
import { decodeEntities, titleMatchesProduct } from "./text";

/** Subset of a YouTube Data API v3 search.list item. */
export interface YouTubeSearchItem {
  id?: { kind?: string; videoId?: string };
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
}

export interface FoundVideo {
  videoId: string;
  title: string;
  channelId: string | null;
  channelTitle: string | null;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  videoUrl: string;
  embedUrl: string;
}

/** Keeps videos that are clearly about this product, one per channel, newest first. */
export function pickProductVideos(items: YouTubeSearchItem[], brand: string, productName: string, max = 6): FoundVideo[] {
  const seenChannels = new Set<string>();
  const out: FoundVideo[] = [];
  for (const item of items) {
    const videoId = item.id?.videoId;
    const s = item.snippet;
    if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId) || !s?.title) continue;
    const title = decodeEntities(s.title);
    // Match on the title, or title + description with a stricter bar.
    const about =
      titleMatchesProduct(title, brand, productName, 0.5) ||
      titleMatchesProduct(`${title} ${decodeEntities(s.description ?? "")}`, brand, productName, 0.8);
    if (!about) continue;
    if (s.channelId) {
      if (seenChannels.has(s.channelId)) continue;
      seenChannels.add(s.channelId);
    }
    const publishedAt = s.publishedAt ? new Date(s.publishedAt) : null;
    out.push({
      videoId,
      title,
      channelId: s.channelId ?? null,
      channelTitle: s.channelTitle ? decodeEntities(s.channelTitle) : null,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      thumbnailUrl: s.thumbnails?.high?.url ?? s.thumbnails?.medium?.url ?? s.thumbnails?.default?.url ?? null,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    });
  }
  return out
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, max);
}

export function isYouTubeConfigured(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}

/** One search.list call (100 quota units of the default 10,000/day). */
export async function searchYouTube(query: string, country: "IN" | "US", publishedAfter?: Date): Promise<YouTubeSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: query,
    maxResults: "15",
    order: "relevance",
    relevanceLanguage: "en",
    regionCode: country,
    safeSearch: "strict",
    key: process.env.YOUTUBE_API_KEY ?? "",
  });
  if (publishedAfter) params.set("publishedAfter", publishedAfter.toISOString());
  const json = await fetchJson<{ items?: YouTubeSearchItem[] }>(`https://www.googleapis.com/youtube/v3/search?${params}`);
  return json.items ?? [];
}
