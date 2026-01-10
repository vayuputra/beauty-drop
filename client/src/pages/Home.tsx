import { useUser } from "@/hooks/use-user";
import { useDrops } from "@/hooks/use-drops";
import { ProductCard } from "@/components/ProductCard";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { clsx } from "clsx";

const FILTERS = ["All", "Trending", "New", "Skincare", "Makeup"];

export default function Home() {
  const { data: user, isLoading: userLoading } = useUser();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/auth");
    } else if (!userLoading && user && !user.country) {
      setLocation("/onboarding");
    }
  }, [user, userLoading, setLocation]);

  // Fetch drops based on user country preference
  const { data: products, isLoading: productsLoading } = useDrops(user?.country || undefined);

  if (userLoading || !user || !user.country) return <div className="min-h-screen bg-background"><Loader /></div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md px-6 pt-12 pb-4 border-b border-border/40">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">
              New Drops
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Curated for {user.country === 'IN' ? '🇮🇳 India' : '🇺🇸 USA'}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/50 flex items-center justify-center text-accent font-bold overflow-hidden">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (user.firstName?.charAt(0) || 'U').toUpperCase()
            )}
          </div>
        </div>
      </header>

      {/* Filter Chips */}
      <div className="max-w-md mx-auto overflow-x-auto no-scrollbar py-4 px-6 flex gap-3 sticky top-[105px] z-30 bg-background/95 backdrop-blur-sm">
        {FILTERS.map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={clsx(
              "whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 border",
              activeFilter === filter
                ? "bg-foreground text-background border-foreground shadow-md"
                : "bg-white text-muted-foreground border-border hover:border-foreground/30"
            )}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Feed */}
      <main className="max-w-md mx-auto px-6 mt-4 space-y-8">
        {productsLoading ? (
          <Loader />
        ) : products && products.length > 0 ? (
          products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No drops available yet.</p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
