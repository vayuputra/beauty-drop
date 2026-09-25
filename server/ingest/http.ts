/** Small fetch wrapper for ingestion: timeout, size cap, JSON parsing and a clear error. */
export class FetchError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BYTES = 8 * 1024 * 1024;

export async function fetchJson<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json",
      "User-Agent": "BeautyDropBot/1.0 (+https://github.com/vayuputra/beauty-drop)",
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) throw new FetchError(`${res.status} from ${new URL(url).host}`, res.status);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new FetchError(`Response too large from ${new URL(url).host}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new FetchError(`Response too large from ${new URL(url).host}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new FetchError(`Invalid JSON from ${new URL(url).host}`);
  }
}

/**
 * Accepts a bare public hostname like "rarebeauty.com" or "www.nykaa.com".
 * Rejects IPs, localhost, ports, paths and schemes so an admin-entered domain
 * can't be used to reach internal services.
 */
export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)) return null;
  if (/^\d+(\.\d+)+$/.test(d)) return null; // IPv4 literal
  if (d === "localhost" || d.endsWith(".localhost") || d.endsWith(".local") || d.endsWith(".internal")) return null;
  return d;
}
