import { Link } from "wouter";
import { ArrowUpRight, Heart } from "lucide-react";
import { type ProductWithPriceRange } from "@shared/schema";
import { motion } from "framer-motion";
import { useFavoriteIds, useToggleFavorite } from "@/hooks/use-drops";
import { ProductImage } from "@/components/ProductImage";
import { formatPrice, isNewLaunch } from "@/lib/format";

interface ProductCardProps {
  product: ProductWithPriceRange;
}


export function ProductCard({ product }: ProductCardProps) {
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
        <ProductImage
          product={product}
          className="aspect-[4/5] bg-secondary/30"
          imgClassName="transition-transform duration-700 group-hover:scale-105"
        >
          {/* Category / status badges */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
            {isNewLaunch(product.launchedAt) && (
              <span className="bg-accent text-white px-3 py-1 rounded-full shadow-sm text-xs font-bold tracking-wide uppercase">
                New
              </span>
            )}
            <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm text-xs font-bold text-foreground tracking-wide uppercase">
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
        </ProductImage>

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
            product.soldOut ? (
              <p className="text-sm font-semibold text-muted-foreground mb-3">Sold out everywhere</p>
            ) : (
              <p className="text-sm font-semibold text-accent mb-3">
                Starting at {formatPrice(product.minPrice, product.currency)}
              </p>
            )
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
