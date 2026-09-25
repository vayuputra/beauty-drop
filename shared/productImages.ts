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
