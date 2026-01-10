import { useUser } from "@/hooks/use-user";
import { useDrops, useRefreshTrending } from "@/hooks/use-drops";
import { ProductCard } from "@/components/ProductCard";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FILTERS = ["All", "Trending", "New", "Skincare", "Makeup"];

export default function Home() {
  const { data: user, isLoading: userLoading } = useUser();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState("All");
  const refreshTrending = useRefreshTrending();
  const { toast } = useToast();

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/auth");
    } else if (!userLoading && user && !user.country) {
      setLocation("/onboarding");
    }
  }, [user, userLoading, setLocation]);

  // Fetch drops based on user country preference
  const { data: products, isLoading: productsLoading, refetch } = useDrops(user?.country || undefined);

  const handleRefreshTrending = async () => {
    try {
      const result = await refreshTrending.mutateAsync();
      await refetch();
      toast({
        title: "Trending data refreshed",
        description: `Updated influencer data for ${result.results?.length || 0} products`,
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Could not refresh trending data. Please try again.",
        variant: "destructive",
      });
    }
  };

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
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshTrending}
              disabled={refreshTrending.isPending}
              data-testid="button-refresh-trending"
              className="gap-2"
            >
              {refreshTrending.isPending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {refreshTrending.isPending ? 'Refreshing...' : 'Refresh'}
            </Button>
            <div className="h-10 w-10 rounded-full bg-primary/50 flex items-center justify-center text-accent font-bold overflow-hidden">
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                (user.firstName?.charAt(0) || 'U').toUpperCase()
              )}
            </div>
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
          <div className="text-center py-16 px-4">
            <div className="mb-6">
              <Sparkles size={48} className="mx-auto text-muted-foreground/50 mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                No Trending Products Yet
              </h2>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                We show products that influencers are actively talking about. Click the button below to discover what's trending right now!
              </p>
            </div>
            <Button
              onClick={handleRefreshTrending}
              disabled={refreshTrending.isPending}
              data-testid="button-discover-trending"
              className="gap-2"
            >
              {refreshTrending.isPending ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {refreshTrending.isPending ? 'Discovering...' : 'Discover Trending Products'}
            </Button>
            {refreshTrending.isPending && (
              <p className="text-xs text-muted-foreground mt-4">
                Searching YouTube, Instagram, and TikTok for beauty influencers...
              </p>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
