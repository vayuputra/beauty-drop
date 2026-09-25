import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { BellRing, Heart, ShoppingBag, X } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useDeletePriceTracker, useFavorites, usePriceTrackers } from "@/hooks/use-drops";
import { useToast } from "@/hooks/use-toast";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { BottomNav, TopNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { formatPrice } from "@/lib/format";
import { haptic } from "@/lib/haptics";

/** Saved products and price alerts. Agent-prepared carts will live here too. */
export default function BagPage() {
  const { data: user, isLoading: userLoading } = useUser();
  const { data: favorites, isLoading } = useFavorites();
  const { data: trackers } = usePriceTrackers();
  const deleteTracker = useDeletePriceTracker();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!userLoading && !user) setLocation("/auth");
  }, [user, userLoading, setLocation]);

  if (userLoading || !user) return <div className="min-h-screen bg-background"><Loader /></div>;

  const alerts = (trackers ?? []).filter((t: any) => t.isActive !== false && t.product);
  const empty = !isLoading && (favorites?.length ?? 0) === 0 && alerts.length === 0;

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-12">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/40" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto px-5 pt-5 pb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">Bag</h1>
            <p className="text-sm text-muted-foreground">Saved products and price alerts</p>
          </div>
          <TopNav />
        </div>
      </header>

      <main className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto px-5 mt-6 space-y-10">
        {isLoading ? (
          <Loader />
        ) : empty ? (
          <div className="text-center py-20 px-4">
            <ShoppingBag size={44} className="mx-auto text-accent/50 mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Your bag is empty</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Tap <Heart size={13} className="inline -mt-0.5" /> on anything you love, or the bell on a product to get told when its price drops.
            </p>
            <Link href="/" className="inline-block mt-6 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold">
              See today&apos;s drops
            </Link>
          </div>
        ) : (
          <>
            {alerts.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                  <BellRing size={20} className="text-accent" /> Price alerts
                </h2>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {alerts.map((t: any) => {
                    const p = t.product;
                    const now = p.minPrice;
                    const since = t.baselinePrice as number | null;
                    const dropped = now != null && since != null && now < since;
                    return (
                      <div key={t.id} className="min-w-0 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                        <Link href={`/product/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                          <ProductImage fallbackLabels={false} product={p} className="h-14 w-14 rounded-xl bg-secondary flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{p.brand}</p>
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {now != null && p.currency ? (
                                <>
                                  Now <span className={`font-semibold ${dropped ? "text-success" : "text-foreground"}`}>{formatPrice(now, p.currency)}</span>
                                  {since != null && since !== now && ` · ${formatPrice(since, p.currency)} when you started`}
                                </>
                              ) : (
                                "Waiting for a price"
                              )}
                            </p>
                          </div>
                        </Link>
                        <button
                          onClick={async () => {
                            haptic();
                            await deleteTracker.mutateAsync(t.id);
                            toast({ title: "Price alert removed" });
                          }}
                          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
                          aria-label={`Stop price alerts for ${p.name}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {(favorites?.length ?? 0) > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                  <Heart size={20} className="text-accent" /> Saved
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-7">
                  {favorites!.map((product: any) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
