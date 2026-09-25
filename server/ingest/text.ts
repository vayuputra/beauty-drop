const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Plain text from a product description's HTML. */
export function htmlToText(html: string | null | undefined, maxLength = 600): string {
  if (!html) return "";
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), maxLength - 40)).trimEnd() + "…";
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "by", "of", "a", "an", "in", "on", "to", "new", "ml", "g", "oz", "fl", "mini",
  "full", "size", "travel", "set", "kit", "pack", "pc", "pcs", "x",
]);

/** Lowercase alphanumeric tokens, without stopwords or bare numbers. */
export function significantTokens(s: string): string[] {
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
    ),
  );
}

/**
 * Does `candidate` (a listing or video title) refer to this brand + product?
 * Requires the brand and most of the product name's distinctive words.
 */
export function titleMatchesProduct(candidate: string, brand: string, productName: string, minShare = 0.6): boolean {
  const have = new Set(significantTokens(candidate));
  const brandTokens = significantTokens(brand);
  if (brandTokens.length > 0 && !brandTokens.every((t) => have.has(t))) return false;
  const nameTokens = significantTokens(productName).filter((t) => !brandTokens.includes(t));
  if (nameTokens.length === 0) return true;
  const hits = nameTokens.filter((t) => have.has(t)).length;
  return hits / nameTokens.length >= minShare;
}
