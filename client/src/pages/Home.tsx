import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { clsx } from "clsx";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Bell, Sparkles, ArrowRight, RefreshCw, Settings2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useFeed, useUnreadNotificationCount } from "@/hooks/use-drops";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { StoriesRow } from "@/components/Stories";
import { BottomNav, TopNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { formatPrice, isNewLaunch } from "@/lib/format";
import type { ProductWithPriceRange } from "@shared/schema";

const FILTERS = ["All", "Trending", "Skincare", "Makeup", "Body", "Hair", "Nails", "Fragrance"];

function greeting(date: Date) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Carousel({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 px-5 lg:mx-0 lg:px-0 flex gap-4 overflow-x-auto no-scrollbar horizontal-scroll pb-2">{children}</div>
  );
}

function HeroDrop({ product }: { product: ProductWithPriceRange }) {
  const isNew = isNewLaunch(product.launchedAt, 30);
  return (
    <Link href={`/product/${product.id}`} className="block group" onPointerEnter={() => import("@/pages/ProductDetails")}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative overflow-hidden rounded-[1.75rem] shadow-xl shadow-accent/10"
      >
        <ProductImage fallbackLabels={false}
          product={product}
          priority
          className="aspect-[4/5] md:aspect-[16/10] bg-secondary"
          imgClassName="transition-transform duration-[1200ms] group-hover:scale-[1.03]"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent pointer-events-none" />
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="flex items-center gap-1.5 bg-background/90 backdrop-blur-md text-foreground px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
              <Sparkles size={12} className="text-accent" /> Drop of the day
            </span>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-5 text-white">
            {isNew && product.launchedAt && (
              <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
                Launched {format(new Date(product.launchedAt), "d MMM")}
              </p>
            )}
            <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white/85">{product.brand}</p>
            <h2 className="font-display text-3xl font-bold leading-tight text-white">{product.name}</h2>
            <div className="mt-4 flex items-center justify-between gap-3">
              {product.minPrice != null && product.currency ? (
                <p className="text-lg font-semibold">
                  <span className="text-white/75 text-sm font-normal">from </span>
                  {formatPrice(product.minPrice, product.currency)}
                </p>
              ) : <span />}
              <span className="flex items-center gap-2 bg-white text-black px-4 py-2.5 rounded-full text-sm font-semibold group-hover:gap-3 transition-all">
                See it <ArrowRight size={16} />
              </span>
            </div>
          </div>
        </ProductImage>
      </motion.div>
    </Link>
  );
}

export default function Home() {
  const { data: user, isLoading: userLoading } = useUser();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState("All");
  const { data: unreadData } = useUnreadNotificationCount();
  const { data: feed, isLoading: productsLoading, refetch } = useFeed(user?.country || undefined);
  const { pull, refreshing } = usePullToRefresh(() => refetch());

  useEffect(() => {
    if (!userLoading && !user) setLocation("/auth");
    else if (!userLoading && user && !user.country) setLocation("/onboarding");
  }, [user, userLoading, setLocation]);

  const forYou = useMemo(() => {
    const list = feed?.forYou ?? [];
    if (activeFilter === "All") return list;
    if (activeFilter === "Trending") return [...list].sort((a, b) => (b.influencerCount ?? 0) - (a.influencerCount ?? 0));
    return list.filter((p) => p.category.toLowerCase() === activeFilter.toLowerCase());
  }, [feed, activeFilter]);

  if (userLoading || !user || !user.country) return <div className="min-h-screen bg-background"><Loader /></div>;

  const unread = unreadData?.count ?? 0;
  const now = new Date();

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-12 momentum-scroll">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/40" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto px-5 pt-5 pb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground truncate">
              {format(now, "EEEE, d MMMM")}
            </p>
            <h1 className="font-display text-[1.7rem] leading-tight font-bold text-foreground">
              {user.firstName ? `${greeting(now)}, ${user.firstName}` : "Today"}
            </h1>
          </div>
          <TopNav />
          <div className="flex items-center gap-2 flex-shrink-0">
            {user.isAdmin && (
              <Link href="/admin" className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center" aria-label="Data & ingestion">
                <Settings2 size={18} />
              </Link>
            )}
            <Link
              href="/notifications"
              className="relative h-10 w-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
              aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-accent text-accent-foreground text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Pull-to-refresh indicator */}
      <div className="flex justify-center overflow-hidden transition-[height] duration-200" style={{ height: pull }} aria-hidden={!refreshing}>
        <RefreshCw
          size={20}
          className={clsx("mt-4 text-accent", refreshing && "animate-spin")}
          style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / 60) }}
        />
      </div>

      <main className="max-w-md md:max-w-3xl lg:max-w-6xl mx-auto px-5 mt-5 space-y-10">
        {productsLoading ? (
          <Loader variant="feed" />
        ) : !feed || feed.total === 0 ? (
          <div className="text-center py-20 px-4">
            <Sparkles size={44} className="mx-auto text-accent/60 mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">New drops are on their way</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              We&apos;re curating the latest launches for your region. Check back soon.
            </p>
          </div>
        ) : (
          <>
            <StoriesRow stories={feed.stories} />

            <div className="lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-8 lg:items-start space-y-10 lg:space-y-0">
              {feed.hero && <HeroDrop product={feed.hero} />}

              {feed.justLaunched.length > 0 && (
                <Section title="Just launched" subtitle="New this month">
                  <Carousel>
                    {feed.justLaunched.map((p) => (
                      <ProductCard key={p.id} product={p} className="w-40 flex-shrink-0 lg:w-44" />
                    ))}
                  </Carousel>
                </Section>
              )}
            </div>

            {feed.priceDrops.length > 0 && (
              <Section title="Price dropped" subtitle="Lower than the last price we saw">
                <Carousel>
                  {feed.priceDrops.map((d) => (
                    <ProductCard key={d.productId} product={d.product} drop={d} className="w-40 flex-shrink-0 lg:w-44" />
                  ))}
                </Carousel>
              </Section>
            )}

            <Section title="For you" subtitle="Picked from your favourite categories">
              <div className="-mx-5 px-5 lg:mx-0 lg:px-0 overflow-x-auto no-scrollbar horizontal-scroll flex gap-2 pb-1" role="group" aria-label="Filter by category">
                {FILTERS.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    aria-pressed={activeFilter === filter}
                    className={clsx(
                      "whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border",
                      activeFilter === filter
                        ? "bg-foreground text-background border-foreground"
                        : "bg-card text-muted-foreground border-border hover:border-foreground/30",
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              {forYou.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-7 pt-2">
                  {forYou.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-10">
                  Nothing in {activeFilter.toLowerCase()} yet. Try another category.
                </p>
              )}
            </Section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
