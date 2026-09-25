import type { Request, Response } from "express";
import { isAllowedImageHost } from "./imageProxyDomains";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Raster formats only. SVG is deliberately excluded: an SVG served from our own
 * origin can carry script, and several allowlisted CDNs host user uploads.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export type UrlCheck = { ok: true; url: URL } | { ok: false; status: number; error: string };

export function checkImageUrl(raw: unknown): UrlCheck {
  if (typeof raw !== "string" || !raw) return { ok: false, status: 400, error: "Missing url parameter" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: 400, error: "Invalid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, status: 400, error: "Only https URLs are allowed" };
  if (url.username || url.password) return { ok: false, status: 400, error: "Credentials in URL are not allowed" };
  if (url.port && url.port !== "443") return { ok: false, status: 400, error: "Non-standard ports are not allowed" };
  if (!isAllowedImageHost(url.hostname)) return { ok: false, status: 403, error: "Domain not allowed" };
  return { ok: true, url };
}

export function normalizeContentType(header: string | null): string | null {
  const type = (header ?? "").split(";")[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.has(type) ? type : null;
}

/**
 * Fetches `start`, following at most MAX_REDIRECTS redirects and re-checking the
 * allowlist on every hop so a redirect can't reach an arbitrary or internal host.
 */
async function fetchAllowlisted(start: URL): Promise<globalThis.Response | UrlCheck> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BeautyDropImageProxy/1.0)",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return { ok: false, status: 502, error: "Bad redirect" };
    const next = checkImageUrl(new URL(location, url).toString());
    if (!next.ok) return { ok: false, status: 403, error: "Redirect target not allowed" };
    url = next.url;
  }
  return { ok: false, status: 502, error: "Too many redirects" };
}

async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<Buffer | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function handleImageProxy(req: Request, res: Response) {
  const check = checkImageUrl(req.query.url);
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  try {
    const upstream = await fetchAllowlisted(check.url);
    if (!(upstream instanceof globalThis.Response)) {
      return res.status(upstream.ok ? 502 : upstream.status).json({ error: upstream.ok ? "Proxy error" : upstream.error });
    }
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "Failed to fetch image" });
    }

    const contentType = normalizeContentType(upstream.headers.get("content-type"));
    if (!contentType) {
      await upstream.body.cancel();
      return res.status(415).json({ error: "Unsupported image type" });
    }

    const declared = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      await upstream.body.cancel();
      return res.status(413).json({ error: "Image too large" });
    }

    const buffer = await readCapped(upstream.body, MAX_IMAGE_BYTES);
    if (!buffer) return res.status(413).json({ error: "Image too large" });

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(502).json({ error: "Failed to proxy image" });
  }
}
