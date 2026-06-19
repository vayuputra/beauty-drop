import { useMemo, useState } from "react";
import {
  type ProductImageInfo,
  generateProductSvgDataUri,
  getProxiedImageUrl,
  isPlaceholderImage,
} from "@/lib/productImage";

interface ProductImageProps {
  product: ProductImageInfo & { imageCandidates?: string[] | null };
  className?: string;
  /** object-fit for the real photo. SVG fallback always fills the frame. */
  fit?: "cover" | "contain";
  /** Rendered above the image (badges, buttons). */
  children?: React.ReactNode;
  imgClassName?: string;
  /** Marks the hero image so it isn't lazy-loaded. */
  priority?: boolean;
}

/**
 * Renders a product image with a resilient fallback chain:
 *   real photo candidate(s) → deterministic on-brand SVG card.
 *
 * Every product therefore always shows an attractive, correct, on-brand image —
 * never a broken <img>, never a misleading generic stock photo.
 */
export function ProductImage({
  product,
  className = "",
  fit = "cover",
  children,
  imgClassName = "",
  priority = false,
}: ProductImageProps) {
  // Build an ordered list of real-photo candidates to try, most-trusted first.
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (product.imageUrl && !isPlaceholderImage(product.imageUrl)) list.push(product.imageUrl);
    for (const c of product.imageCandidates || []) {
      if (c && !isPlaceholderImage(c) && !list.includes(c)) list.push(c);
    }
    return list;
  }, [product.imageUrl, product.imageCandidates]);

  const svg = useMemo(() => generateProductSvgDataUri(product), [product.name, product.brand, product.category]);

  // Index into `candidates`; once it passes the end we render the SVG fallback.
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const usingFallback = index >= candidates.length;
  const src = usingFallback ? svg : getProxiedImageUrl(candidates[index]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Shimmer placeholder while a real photo is still loading. */}
      {!loaded && !usingFallback && (
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/40 to-secondary/20 animate-pulse" aria-hidden="true" />
      )}
      <img
        key={src}
        src={src}
        alt={`${product.brand} ${product.name}`}
        className={`w-full h-full ${fit === "cover" ? "object-cover" : "object-contain"} transition-opacity duration-300 ${
          loaded || usingFallback ? "opacity-100" : "opacity-0"
        } ${imgClassName}`}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          if (!usingFallback) setIndex((i) => i + 1);
        }}
      />
      {children}
    </div>
  );
}
