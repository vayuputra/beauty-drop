import { useState, useMemo } from "react";
import { useUser } from "@/hooks/use-user";
import { useDrops } from "@/hooks/use-drops";
import { ProductCard } from "@/components/ProductCard";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function SearchPage() {
  const { data: user } = useUser();
  const [query, setQuery] = useState("");

  const country = user?.country || "US";
  const { data: products, isLoading } = useDrops(country);

  const filtered = useMemo(() => {
    if (!products || !query.trim()) return products || [];
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, query]);

  if (isLoading) return <Loader />;

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
        {query.trim() && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <SearchIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No products found for "{query}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
