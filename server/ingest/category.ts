export const CATEGORIES = ["Makeup", "Skincare", "Body", "Hair", "Nails", "Fragrance"] as const;
export type Category = (typeof CATEGORIES)[number];

const RULES: [Category, RegExp][] = [
  ["Nails", /\b(nail|polish|lacquer|cuticle|manicure)\b/],
  ["Fragrance", /\b(fragrance|perfume|parfum|eau de|cologne|body mist|hair mist|scent)\b/],
  ["Hair", /\b(hair|shampoo|conditioner|scalp|curl|styling)\b/],
  ["Makeup", /\b(makeup|make-up|lip|lipstick|gloss|liner|mascara|brow|blush|bronzer|highlighter|foundation|concealer|primer|powder|eyeshadow|shadow|palette|tint|kajal|kohl|contour|setting spray|cheek)\b/],
  ["Body", /\b(body|hand|foot|deodorant|shower|bath|lotion|butter|scrub)\b/],
  ["Skincare", /\b(skin|serum|moisturi[sz]er|cream|cleanser|toner|essence|sunscreen|spf|mask|exfoliat|retinol|niacinamide|acid|eye cream|face|oil|balm|mist|gel)\b/],
];

/** Maps a store's product type / tags / title onto the app's category filters. */
export function mapCategory(productType: string | null | undefined, tags: string[] = [], title = ""): Category {
  // Product type is the most deliberate signal, then title, then tags.
  for (const text of [productType ?? "", title, tags.join(" ")]) {
    const t = text.toLowerCase();
    if (!t) continue;
    for (const [category, re] of RULES) if (re.test(t)) return category;
  }
  return "Skincare";
}
