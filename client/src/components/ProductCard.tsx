import { Link } from "wouter";
import { ArrowUpRight, Heart, ImageOff } from "lucide-react";
import { type ProductWithPriceRange } from "@shared/schema";
import { motion } from "framer-motion";
import { useState } from "react";
import { useFavoriteIds, useToggleFavorite } from "@/hooks/use-drops";

interface ProductCardProps {
  product: ProductWithPriceRange;
}

function formatPrice(price: number, currency: string): string {
  if (currency === 'INR') {
    return `₹${price.toLocaleString('en-IN')}`;
  }
  return `$${price.toFixed(2)}`;
}

/** Check if URL is a placeholder (not a real product image) */
function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return true;
  return url.includes('placehold.co') || url.includes('unsplash.com');
}

function getProxiedImageUrl(url: string): string {
  if (!url) return '';
  if (url.includes('placehold.co')) return url;
  if (url.includes('unsplash.com')) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export function ProductCard({ product }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const hasRealImage = !isPlaceholderImage(product.imageUrl) && !imgError;
  const displayUrl = hasRealImage
    ? getProxiedImageUrl(product.imageUrl)
    : '';

  const { data: favoriteIds } = useFavoriteIds();
  const toggleFavorite = useToggleFavorite();
  const isFavorited = favoriteIds?.includes(product.id) ?? false;

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite.mutate({ productId: product.id, isFavorited });
  };

  return (
    <Link href={`/product/${product.id}`} className="block group">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="relative bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-secondary hover:shadow-xl hover:border-primary/50 transition-all duration-300"
      >
        {/* Image Container */}
        <div className="aspect-[4/5] relative overflow-hidden bg-secondary/30">
          {hasRealImage ? (
            <img
              src={displayUrl}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-pink-50 to-pink-100 p-6 text-center">
              <ImageOff size={36} className="text-pink-300 mb-3" />
              <p className="text-lg font-bold text-pink-600">{product.brand}</p>
              <p className="text-sm text-pink-500 line-clamp-2 mt-1">{product.name}</p>
              <p className="text-[10px] text-pink-400 mt-3 uppercase tracking-wider">Tap to view product</p>
            </div>
          )}

          {/* Category Badge */}
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
            <span className="text-xs font-bold text-foreground tracking-wide uppercase">
              {product.category}
            </span>
          </div>

          {/* Favorite Button */}
          <button
            onClick={handleFavoriteClick}
            className="absolute top-3 left-3 h-8 w-8 bg-white/90 backdrop-blur-sm rounded-full shadow-sm flex items-center justify-center transition-transform hover:scale-110"
            aria-label={isFavorited ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart
              size={16}
              className={isFavorited ? "text-red-500 fill-red-500" : "text-foreground/60"}
            />
          </button>

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 pointer-events-none" />
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-1">
            {product.brand}
          </h3>
          <h2 className="font-display text-xl font-semibold text-foreground leading-tight mb-2 line-clamp-2">
            {product.name}
          </h2>

          {/* Price Display */}
          {product.minPrice != null && product.currency && (
            <p className="text-sm font-semibold text-accent mb-3">
              Starting at {formatPrice(product.minPrice, product.currency)}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 gap-2">
            <span className="text-xs font-medium px-2 py-1 bg-secondary rounded-md text-secondary-foreground">
              {product.country === 'IN' ? 'India' : 'USA'}
            </span>

            <div className="h-8 w-8 rounded-full bg-accent text-white flex items-center justify-center group-hover:bg-foreground transition-colors">
              <ArrowUpRight size={16} />
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
