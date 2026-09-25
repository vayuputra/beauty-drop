import { Link } from "wouter";
import { Heart } from "lucide-react";
import { type ProductWithPriceRange } from "@shared/schema";
import { useFavoriteIds, useToggleFavorite } from "@/hooks/use-drops";
import { ProductImage } from "@/components/ProductImage";
import { formatPrice, isNewLaunch } from "@/lib/format";
import { haptic } from "@/lib/haptics";

interface ProductCardProps {
  product: ProductWithPriceRange;
  /** Show a price-drop badge with the previous price struck through. */
  drop?: { previousPrice: number; currentPrice: number; dropPercent: number };
  /** Fixed width for horizontal carousels; grids leave it fluid. */
  className?: string;
}

const preloadProduct = () => import("@/pages/ProductDetails");

/** Compact product tile used in feeds, carousels and grids. */
export function ProductCard({ product, drop, className = "" }: ProductCardProps) {
  const { data: favoriteIds } = useFavoriteIds();
  const toggleFavorite = useToggleFavorite();
  const isFavorited = favoriteIds?.includes(product.id) ?? false;

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    haptic(isFavorited ? "light" : "success");
    toggleFavorite.mutate({ productId: product.id, isFavorited });
  };

  return (
    <Link
      href={`/product/${product.id}`}
      className={`block group ${className}`}
      onPointerEnter={preloadProduct}
      onTouchStart={preloadProduct}
    >
      <div className="relative">
        <ProductImage fallbackLabels={false}
          product={product}
          className="aspect-[4/5] rounded-2xl bg-secondary/40"
          imgClassName="transition-transform duration-700 group-hover:scale-[1.04]"
        >
          <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5">
            {drop ? (
              <span className="bg-success text-white px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm">
                −{drop.dropPercent}%
              </span>
            ) : isNewLaunch(product.launchedAt) ? (
              <span className="bg-accent text-accent-foreground px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase shadow-sm">
                New
              </span>
            ) : null}
          </div>

          <button
            onClick={handleFavoriteClick}
            className="absolute top-2 right-2 h-9 w-9 bg-background/85 backdrop-blur-md rounded-full shadow-sm flex items-center justify-center transition-transform active:scale-90"
            aria-label={isFavorited ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={isFavorited}
          >
            <Heart size={16} className={isFavorited ? "text-accent fill-accent" : "text-foreground/70"} />
          </button>
        </ProductImage>
      </div>

      <div className="pt-2.5 px-0.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{product.brand}</p>
        <h3 className="mt-0.5 text-sm font-medium text-foreground leading-snug line-clamp-2 font-sans">{product.name}</h3>
        {product.minPrice != null && product.currency && (
          product.soldOut ? (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">Sold out</p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-foreground">
              {!drop && product.maxPrice != null && product.maxPrice > product.minPrice && (
                <span className="text-muted-foreground font-normal">from </span>
              )}
              {formatPrice(drop ? drop.currentPrice : product.minPrice, product.currency)}
              {drop && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
                  {formatPrice(drop.previousPrice, product.currency)}
                </span>
              )}
            </p>
          )
        )}
      </div>
    </Link>
  );
}
