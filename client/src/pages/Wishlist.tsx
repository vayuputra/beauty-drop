import { useUser } from "@/hooks/use-user";
import { useFavorites } from "@/hooks/use-drops";
import { ProductCard } from "@/components/ProductCard";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { Heart } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function WishlistPage() {
  const { data: user, isLoading: userLoading } = useUser();
  const { data: favorites, isLoading } = useFavorites();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/auth");
    }
  }, [user, userLoading, setLocation]);

  if (userLoading || !user) return <div className="min-h-screen bg-background"><Loader /></div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md px-6 pt-12 pb-4 border-b border-border/40">
        <div className="max-w-md mx-auto">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Wishlist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Products you've saved
          </p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-4">
        {isLoading ? (
          <Loader />
        ) : favorites && favorites.length > 0 ? (
          <div className="space-y-8">
            {favorites.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-4">
            <Heart size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              No saved products yet
            </h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Tap the heart icon on any product to save it to your wishlist for easy access later.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
