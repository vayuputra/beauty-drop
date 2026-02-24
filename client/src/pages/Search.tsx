import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useSearchProducts, useDrops } from "@/hooks/use-drops";
import { ProductCard } from "@/components/ProductCard";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { Search as SearchIcon, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function SearchPage() {
  const { data: user } = useUser();
  const [query, setQuery] = useState("");

  const country = user?.country || "US";
  const { data: searchResults, isLoading: searchLoading } = useSearchProducts(query, country);
  const { data: trendingProducts, isLoading: trendingLoading } = useDrops(country);

  const isSearching = query.trim().length >= 2;
  const results = isSearching ? searchResults : null;
  const isLoading = isSearching ? searchLoading : trendingLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products, brands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <Loader />
        ) : isSearching && results && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <SearchIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No products found for "{query}"</p>
          </div>
        ) : isSearching && results ? (
          <div>
            <p className="text-sm text-muted-foreground mb-3">{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</p>
            <div className="grid grid-cols-2 gap-3">
              {results.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-accent" />
              <p className="text-sm font-medium text-foreground">Trending Now</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {trendingProducts?.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
