/**
 * Product image utilities.
 *
 * The app shows real official product photography whenever it loads. But retailer
 * CDNs (Sephora, Nykaa, Amazon, …) frequently hot-link-block, rate-limit, or move
 * images, which historically left users staring at broken images or generic stock
 * photos that didn't match the product. To guarantee every product always renders
 * something attractive, correct, and on-brand — with zero network dependency — we
 * generate a deterministic, category-aware SVG "beauty card" as the final fallback.
 *
 * This is intentionally a stylised illustration (clearly not a deceptive photo), so
 * it is honest: it never pretends a generic stock image is the real product.
 */

export interface ProductImageInfo {
  id?: number;
  name: string;
  brand: string;
  category?: string | null;
  imageUrl?: string | null;
}

/** A URL is a "placeholder" (not a real product photo) if it's empty, a text
 *  placeholder service, or a generic stock-photo host we no longer trust. */
export function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.toLowerCase();
  return (
    u.includes("placehold.co") ||
    u.includes("placeholder.com") ||
    u.includes("unsplash.com") ||
    u.includes("dummyimage.com")
  );
}

/** Route real (remote) product images through our server-side proxy so retailer
 *  hot-linking / referrer checks don't break them. Local + data URIs pass through. */
export function getProxiedImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/")) return url;
  if (isPlaceholderImage(url)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

type Palette = {
  bg1: string;
  bg2: string;
  accent: string;
  ink: string;
  soft: string;
  vessel: "dropper" | "tube" | "compact" | "polish" | "pump" | "jar";
};

/** Category-aware palettes tuned for a Gen-Z beauty audience. */
function paletteFor(category?: string | null): Palette {
  const c = (category || "").toLowerCase();
  if (c.includes("skin")) {
    return { bg1: "#e0f7f4", bg2: "#c4f0e9", accent: "#0d9488", ink: "#134e4a", soft: "#5eead4", vessel: "dropper" };
  }
  if (c.includes("body")) {
    return { bg1: "#ffe9d6", bg2: "#ffd2b3", accent: "#ea580c", ink: "#7c2d12", soft: "#fdba74", vessel: "pump" };
  }
  if (c.includes("nail")) {
    return { bg1: "#ede9fe", bg2: "#ddd6fe", accent: "#7c3aed", ink: "#4c1d95", soft: "#c4b5fd", vessel: "polish" };
  }
  if (c.includes("hair")) {
    return { bg1: "#fef3c7", bg2: "#fde68a", accent: "#d97706", ink: "#78350f", soft: "#fcd34d", vessel: "pump" };
  }
  // Makeup / default
  return { bg1: "#fce7f3", bg2: "#fbcfe8", accent: "#db2777", ink: "#831843", soft: "#f9a8d4", vessel: "tube" };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars` chars. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last.length > maxChars) lines[maxLines - 1] = last.slice(0, maxChars - 1).trimEnd() + "…";
  }
  return lines;
}

/** Tiny deterministic string hash (djb2) for stable unique ids. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h | 0;
}

/** Stylised product vessel silhouette, centered around x=300, drawn ~y 150–330. */
function vesselSvg(p: Palette, sheenId: string): string {
  const { accent, soft, ink } = p;
  const sheen = `url(#${sheenId})`;
  switch (p.vessel) {
    case "dropper":
      return `
        <rect x="262" y="180" width="76" height="120" rx="14" fill="${accent}"/>
        <rect x="262" y="180" width="76" height="120" rx="14" fill="${sheen}"/>
        <rect x="278" y="150" width="44" height="34" rx="8" fill="${ink}"/>
        <rect x="294" y="120" width="12" height="40" rx="6" fill="${ink}"/>
        <circle cx="300" cy="116" r="10" fill="${soft}"/>`;
    case "polish":
      return `
        <rect x="270" y="196" width="60" height="104" rx="12" fill="${accent}"/>
        <rect x="270" y="196" width="60" height="104" rx="12" fill="${sheen}"/>
        <rect x="286" y="150" width="28" height="48" rx="6" fill="${ink}"/>
        <rect x="292" y="128" width="16" height="26" rx="5" fill="${soft}"/>`;
    case "compact":
      return `
        <circle cx="300" cy="240" r="74" fill="${accent}"/>
        <circle cx="300" cy="240" r="74" fill="${sheen}"/>
        <circle cx="300" cy="240" r="48" fill="${soft}" opacity="0.6"/>
        <rect x="288" y="158" width="24" height="14" rx="6" fill="${ink}"/>`;
    case "pump":
      return `
        <rect x="256" y="188" width="88" height="120" rx="16" fill="${accent}"/>
        <rect x="256" y="188" width="88" height="120" rx="16" fill="${sheen}"/>
        <rect x="286" y="150" width="28" height="40" rx="6" fill="${ink}"/>
        <rect x="282" y="138" width="52" height="16" rx="8" fill="${soft}"/>`;
    case "jar":
      return `
        <rect x="260" y="206" width="80" height="94" rx="18" fill="${accent}"/>
        <rect x="260" y="206" width="80" height="94" rx="18" fill="${sheen}"/>
        <rect x="252" y="180" width="96" height="34" rx="14" fill="${ink}"/>`;
    case "tube":
    default:
      return `
        <path d="M268 178 h64 l-8 130 a24 24 0 0 1 -48 0 z" fill="${accent}"/>
        <path d="M268 178 h64 l-8 130 a24 24 0 0 1 -48 0 z" fill="${sheen}"/>
        <rect x="282" y="150" width="36" height="32" rx="8" fill="${ink}"/>
        <ellipse cx="300" cy="150" rx="20" ry="8" fill="${soft}"/>`;
  }
}

/** Build a self-contained SVG "beauty card" for a product. Deterministic, no network. */
export function generateProductSvg(product: ProductImageInfo): string {
  const p = paletteFor(product.category);
  const brand = escapeXml((product.brand || "").toUpperCase().slice(0, 26));
  const nameLines = wrap(escapeXml(product.name || "Product"), 22, 2);
  const category = escapeXml((product.category || "Beauty").toUpperCase());

  // Unique gradient ids so multiple cards can safely coexist if ever inlined.
  const uid = Math.abs(hashString(`${product.brand}|${product.name}|${product.category}`)).toString(36);
  const bgId = `bg-${uid}`;
  const sheenId = `sheen-${uid}`;

  const nameTspans = nameLines
    .map((line, i) => `<tspan x="300" dy="${i === 0 ? 0 : 34}">${line}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${brand} ${escapeXml(product.name)}">
  <defs>
    <linearGradient id="${bgId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.bg1}"/>
      <stop offset="1" stop-color="${p.bg2}"/>
    </linearGradient>
    <linearGradient id="${sheenId}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#${bgId})"/>
  <circle cx="92" cy="96" r="56" fill="#ffffff" opacity="0.18"/>
  <circle cx="520" cy="520" r="90" fill="#ffffff" opacity="0.14"/>
  <text x="76" y="84" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="${p.accent}" opacity="0.55">✦</text>
  <text x="500" y="140" font-family="Georgia, serif" font-size="20" fill="${p.accent}" opacity="0.45">✦</text>
  ${vesselSvg(p, sheenId)}
  <text x="300" y="396" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="${p.accent}">${brand}</text>
  <text x="300" y="438" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-weight="700" fill="${p.ink}">${nameTspans}</text>
  <g transform="translate(300 510)">
    <rect x="-92" y="-20" width="184" height="40" rx="20" fill="#ffffff" opacity="0.7"/>
    <text x="0" y="6" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="600" letter-spacing="2" fill="${p.ink}">${category}</text>
  </g>
  <text x="300" y="566" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="3" fill="${p.accent}" opacity="0.8">✦ BEAUTY DROP</text>
</svg>`;
}

/** SVG as a ready-to-use data URI for an <img src>. */
export function generateProductSvgDataUri(product: ProductImageInfo): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generateProductSvg(product))}`;
}
