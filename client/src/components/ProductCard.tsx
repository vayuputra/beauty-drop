import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { type ProductWithPriceRange } from "@shared/schema";
import { motion } from "framer-motion";
import { useState } from "react";

interface ProductCardProps {
  product: ProductWithPriceRange;
}

function formatPrice(price: number, currency: string): string {
  if (currency === 'INR') {
    return `₹${price.toLocaleString('en-IN')}`;
  }
  return `$${price.toFixed(2)}`;
}

function getPlaceholderUrl(brand: string, name: string): string {
  const text = encodeURIComponent(`${brand}\n${name.substring(0, 20)}`);
  return `https://placehold.co/600x600/fce7f3/db2777?text=${text}`;
}

export function ProductCard({ product }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const fallbackUrl = getPlaceholderUrl(product.brand, product.name);
  const imageUrl = imgError ? fallbackUrl : (product.imageUrl || fallbackUrl);

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
          <img 
            src={imageUrl} 
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
          
          {/* Badge */}
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
            <span className="text-xs font-bold text-foreground tracking-wide uppercase">
              {product.category}
            </span>
          </div>
          
          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
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
          {product.minPrice && product.currency && (
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
