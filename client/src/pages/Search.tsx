import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Search as SearchIcon, TrendingUp, X } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useSearchProducts, useDrops } from "@/hooks/use-drops";
import { ProductCard } from "@/components/ProductCard";
import { BottomNav, TopNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";

const CATEGORIES = ["All", "Skincare", "Makeup", "Body", "Hair", "Nails", "Fragrance"];

export default function SearchPage() {
  const { data: user } = useUser();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const country = user?.country || "US";
  const { data: searchResults, isLoading: searchLoading } = useSearchProducts(query, country);
  const { data: allProducts, isLoading: allLoading } = useDrops(country);

  const isSearching = query.trim().length >= 2;
  const base = isSearching ? searchResults : allProducts;
  const results = useMemo(() => {
    const list: any[] = base ?? [];
    const filtered = category === "All" ? list : list.filter((p) => p.category === category);
    // Browsing without a query: most talked-about first.
    return isSearching ? filtered : [...filtered].sort((a, b) => (b.influencerCount ?? 0) - (a.influencerCount ?? 0));
  }, [base, category, isSearching]);
  const isLoading = isSearching ? searchLoading : allLoading;

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-12">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto px-5 pt-5 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-bold text-foreground">Explore</h1>
            <TopNav />
          </div>
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              inputMode="search"
              placeholder="Products, brands, ingredients…"
              aria-label="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 rounded-2xl bg-secondary pl-11 pr-11 text-base outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-background"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="-mx-5 px-5 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Filter by category">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={clsx(
                  "whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  category === c ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto px-5 py-5">
        {isLoading ? (
          <Loader />
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <SearchIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {isSearching ? `Nothing found for “${query}”` : `No ${category.toLowerCase()} products yet`}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1.5">
              {isSearching ? (
                `${results.length} result${results.length !== 1 ? "s" : ""} for “${query}”`
              ) : (
                <>
                  <TrendingUp size={15} className="text-accent" /> Most talked about
                </>
              )}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-7">
              {results.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
