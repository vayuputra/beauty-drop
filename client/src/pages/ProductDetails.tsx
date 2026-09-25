import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Heart, Newspaper, Play, RefreshCw, Share2, TrendingUp, Wrench } from "lucide-react";
import { SiReddit, SiYoutube } from "react-icons/si";
import {
  useArticles,
  useCalculateTrustScore,
  useCreatePriceTracker,
  useDeletePriceTracker,
  useDiscussions,
  useFavoriteIds,
  useGenerateReviewSummary,
  usePriceHistory,
  usePriceTrackers,
  useProduct,
  useRefreshImage,
  useRefreshInfluencers,
  useRefreshPrices,
  useReviewSummary,
  useToggleFavorite,
  useTrustScore,
} from "@/hooks/use-drops";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { Loader } from "@/components/Loader";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ProductImage } from "@/components/ProductImage";
import { TrustBadge, TrustScoreDetails } from "@/components/TrustBadge";
import { ReviewSummary } from "@/components/ReviewSummary";
import { OffersPanel, PriceBar, offerAction, type OfferView } from "@/components/Offers";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { apiUrl } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { haptic } from "@/lib/haptics";

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35 }}
      className="space-y-3"
    >
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

/** Swipeable product photos: the main image plus any shade images. */
function MediaCarousel({
  product,
  images,
  index,
  onIndexChange,
}: {
  product: any;
  images: string[];
  index: number;
  onIndexChange: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Scroll to a slide when something else (a shade tap) picks it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: "smooth" });
  }, [index]);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar lg:rounded-[1.75rem]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== index) onIndexChange(i);
        }}
        aria-roledescription="carousel"
        aria-label="Product photos"
      >
        {images.map((src, i) => (
          <div key={src || i} className="w-full flex-shrink-0 snap-center" aria-roledescription="slide" aria-label={`${i + 1} of ${images.length}`}>
            <ProductImage fallbackLabels={false}
              product={{ ...product, imageUrl: src || product.imageUrl }}
              priority={i === 0}
              className="aspect-[4/5] w-full bg-secondary"
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5" aria-hidden="true">
          {images.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-foreground" : "w-1.5 bg-foreground/35"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductDetails() {
  const [, params] = useRoute("/product/:id");
  const id = params ? parseInt(params.id) : 0;
  const { toast } = useToast();

  const { data: product, isLoading } = useProduct(id);
  const { data: user } = useUser();
  const { data: trustScoreData } = useTrustScore(id);
  const { data: reviewSummaryData } = useReviewSummary(id);
  const { data: discussionsData } = useDiscussions(id);
  const { data: articlesData } = useArticles(id);
  const { data: priceHistoryData } = usePriceHistory(id);
  const { data: priceTrackers } = usePriceTrackers();
  const { data: favoriteIds } = useFavoriteIds();
  const toggleFavorite = useToggleFavorite();
  const createPriceTracker = useCreatePriceTracker();
  const deletePriceTracker = useDeletePriceTracker();

  // Operator tools
  const refreshInfluencers = useRefreshInfluencers();
  const refreshImage = useRefreshImage();
  const refreshPrices = useRefreshPrices();
  const calculateTrustScore = useCalculateTrustScore();
  const generateReviewSummary = useGenerateReviewSummary();

  const [slide, setSlide] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [playing, setPlaying] = useState<any | null>(null);
  const [checkoutOffer, setCheckoutOffer] = useState<OfferView | null>(null);
  // Give the floating controls a backdrop once the photos scroll away.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerWidth * 0.9);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const variants: any[] = product?.variants ?? [];
  const images = useMemo(() => {
    if (!product) return [];
    const list = [product.imageUrl, ...variants.map((v) => v.imageUrl)].filter((u): u is string => !!u);
    const unique = Array.from(new Set(list));
    return unique.length > 0 ? unique : [""];
  }, [product, variants]);

  if (isLoading) return <div className="min-h-screen bg-background"><Loader /></div>;
  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted-foreground">We couldn&apos;t find that product.</p>
        <Link href="/" className="text-accent font-semibold">Back to Today</Link>
      </div>
    );
  }

  const isFavorited = favoriteIds?.includes(id) ?? false;
  const tracker = priceTrackers?.find((t: any) => t.productId === id);
  const offers: OfferView[] = product.offers ?? [];
  const videos: any[] = product.videos ?? [];
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null;
  const currency = offers[0]?.currency ?? (product.country === "IN" ? "INR" : "USD");
  const brandOffer = offers.find((o) => o.source === "brand_site");

  const handleBuy = (offer: OfferView) => {
    haptic("medium");
    if (offerAction(offer).agent) {
      if (!user) {
        toast({ title: "Sign in to use Add to cart", description: "We'll keep your bag and addresses safe." });
        return;
      }
      setCheckoutOffer(offer);
      return;
    }
    // The server records the click and redirects to the retailer (with its app deep link where supported).
    window.open(apiUrl(`/api/go/${offer.id}`), "_blank", "noopener");
  };

  const handleToggleAlert = async () => {
    if (!user) {
      toast({ title: "Sign in to get price alerts" });
      return;
    }
    haptic(tracker ? "light" : "success");
    try {
      if (tracker) {
        await deletePriceTracker.mutateAsync(tracker.id);
        toast({ title: "Price alerts off" });
      } else {
        await createPriceTracker.mutateAsync({ productId: id, notifyOnAnyDrop: true });
        toast({ title: "We'll tell you when it drops", description: "Alerts for any seller's price drop." });
      }
    } catch {
      toast({ title: "Couldn't update price alerts", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${product.brand} ${product.name}`,
      text: `Check out ${product.name} by ${product.brand} on Beauty Drop ✨`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        toast({ title: "Link copied!", description: "Share it with your friends ✨" });
      }
    } catch {
      // User dismissed the share sheet — no action needed.
    }
  };

  const runTool = async (label: string, fn: () => Promise<any>) => {
    try {
      const r = await fn();
      toast({ title: label, description: r?.message ?? "Done" });
    } catch {
      toast({ title: `${label} failed`, variant: "destructive" });
    }
  };

  const pickVariant = (v: any) => {
    haptic();
    setSelectedVariantId(v.id === selectedVariantId ? null : v.id);
    if (v.imageUrl) {
      const i = images.indexOf(v.imageUrl);
      if (i >= 0) setSlide(i);
    }
  };

  const hasVerdict = trustScoreData?.exists || reviewSummaryData?.exists;

  return (
    <div className="min-h-screen bg-background pb-36 lg:pb-16">
      {/* Floating controls over the photos (mobile) / a slim top bar (desktop) */}
      <div
        className={`fixed top-0 inset-x-0 z-40 pointer-events-none transition-colors duration-200 lg:sticky lg:bg-background/85 lg:backdrop-blur-xl lg:border-b lg:border-border/40 ${
          scrolled ? "bg-background/85 backdrop-blur-xl border-b border-border/40" : ""
        }`}
        style={{ paddingTop: "var(--safe-area-top)" }}
      >
        <div className="max-w-6xl mx-auto px-5 py-3 flex justify-between pointer-events-auto">
          <button
            onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/"))}
            data-testid="button-back"
            aria-label="Back"
            className="h-10 w-10 bg-background/85 backdrop-blur-md rounded-full flex items-center justify-center shadow-md text-foreground active:scale-95 transition-transform"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                haptic(isFavorited ? "light" : "success");
                toggleFavorite.mutate({ productId: product.id, isFavorited });
              }}
              className="h-10 w-10 bg-background/85 backdrop-blur-md rounded-full shadow-md flex items-center justify-center active:scale-95 transition-transform"
              aria-label={isFavorited ? "Remove from wishlist" : "Add to wishlist"}
              aria-pressed={isFavorited}
            >
              <Heart size={18} className={isFavorited ? "text-accent fill-accent" : "text-foreground"} />
            </button>
            <button
              onClick={handleShare}
              className="h-10 w-10 bg-background/85 backdrop-blur-md rounded-full shadow-md flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Share this product"
            >
              <Share2 size={18} className="text-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:pt-6">
        {/* Photos */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <MediaCarousel product={product} images={images} index={slide} onIndexChange={setSlide} />
        </div>

        {/* Details */}
        <div className="px-5 lg:px-0 pt-6 lg:pt-0 space-y-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest text-accent">{product.brand}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{product.category}</span>
              {trustScoreData?.exists && (
                <TrustBadge score={trustScoreData.trustScore} label={trustScoreData.label} color={trustScoreData.color} compact className="ml-auto" />
              )}
            </div>
            <h1 data-testid="text-product-name" className="mt-2 font-display text-[2rem] leading-[1.1] font-bold text-foreground">
              {product.name}
            </h1>
            {product.launchedAt && (
              <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Launched {format(new Date(product.launchedAt), "d MMM yyyy")}
              </p>
            )}
            <p className="mt-4 text-muted-foreground leading-relaxed">{product.description}</p>

            {product.whyTrending && (
              <div className="mt-5 flex gap-3 rounded-2xl bg-primary/40 p-4">
                <TrendingUp size={18} className="text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground">Why it's trending</p>
                  <p className="text-sm text-foreground/85 mt-0.5">{product.whyTrending}</p>
                </div>
              </div>
            )}

            {variants.length > 1 && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-foreground mb-2.5">
                  {variants.length} shades &amp; sizes
                  {selectedVariant && <span className="font-normal text-muted-foreground"> · {selectedVariant.title}</span>}
                </p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0 lg:flex-wrap pb-1" role="group" aria-label="Shades and sizes">
                  {variants.map((v) => {
                    const selected = v.id === selectedVariantId;
                    const soldOut = v.available === false;
                    return (
                      <button
                        key={v.id}
                        onClick={() => pickVariant(v)}
                        aria-pressed={selected}
                        className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm transition-all ${
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : soldOut
                              ? "border-border text-muted-foreground/70 line-through"
                              : "border-border bg-card text-foreground hover:border-foreground/40"
                        }`}
                      >
                        {v.title}
                      </button>
                    );
                  })}
                </div>
                {selectedVariant && brandOffer && (
                  <p className="mt-2.5 text-sm text-muted-foreground">
                    {selectedVariant.available === false
                      ? `${selectedVariant.title} is sold out at ${brandOffer.retailer.name}.`
                      : selectedVariant.price != null
                        ? `${selectedVariant.title}: ${formatPrice(selectedVariant.price, currency)} at ${brandOffer.retailer.name}.`
                        : null}
                  </p>
                )}
              </div>
            )}
          </motion.div>

          {/* Desktop price comparison sits right under the title */}
          <OffersPanel
            offers={offers}
            onBuy={handleBuy}
            tracking={!!tracker}
            onToggleAlert={handleToggleAlert}
            alertBusy={createPriceTracker.isPending || deletePriceTracker.isPending}
          />

          {videos.length > 0 && (
            <Section title="Creator videos" icon={<SiYoutube size={20} className="text-red-500" />}>
              <div className="-mx-5 px-5 lg:mx-0 lg:px-0 flex gap-3 overflow-x-auto no-scrollbar horizontal-scroll pb-1">
                {videos.slice(0, 6).map((video, index) => (
                  <button
                    key={video.id}
                    onClick={() => (video.embedUrl ? setPlaying(video) : window.open(video.videoUrl, "_blank", "noopener"))}
                    className="flex-shrink-0 w-60 text-left group"
                    data-testid={`video-card-${index}`}
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-secondary">
                      {video.thumbnailUrl && (
                        <img src={video.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                        <span className="w-11 h-11 rounded-full bg-background/90 flex items-center justify-center shadow">
                          <Play size={17} fill="currentColor" className="text-foreground ml-0.5" />
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground line-clamp-2 leading-snug">{video.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {video.creatorName}
                      {video.publishedAt && ` · ${formatDistanceToNow(new Date(video.publishedAt), { addSuffix: true })}`}
                    </p>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {hasVerdict && (
            <Section title="The verdict">
              {reviewSummaryData?.exists && (
                <ReviewSummary
                  data={{
                    summaryText: reviewSummaryData.summaryText,
                    climateSuitability: reviewSummaryData.climateSuitability,
                    skinTypeMatch: reviewSummaryData.skinTypeMatch,
                    prosHighlights: reviewSummaryData.prosHighlights,
                    consHighlights: reviewSummaryData.consHighlights,
                    sources: reviewSummaryData.sources,
                  }}
                />
              )}
              {trustScoreData?.exists && (
                <TrustScoreDetails
                  data={{
                    trustScore: trustScoreData.trustScore,
                    label: trustScoreData.label,
                    color: trustScoreData.color,
                    redditSentimentScore: trustScoreData.redditSentimentScore,
                    engagementAuthenticityScore: trustScoreData.engagementAuthenticityScore,
                    redditMentions: trustScoreData.redditMentions,
                  }}
                />
              )}
            </Section>
          )}

          {Array.isArray(priceHistoryData) && priceHistoryData.length > 1 && (
            <PriceHistoryChart points={priceHistoryData} currency={currency} />
          )}

          {articlesData?.exists && articlesData.articles?.length > 0 && (
            <Section title="Read" icon={<Newspaper size={20} className="text-accent" />}>
              <div className="space-y-2">
                {articlesData.articles.slice(0, 6).map((article: any, index: number) => (
                  <a
                    key={index}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-card rounded-2xl border border-border p-4 flex items-start gap-3 hover:border-accent/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-2">{article.title}</p>
                      {article.snippet && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.snippet}</p>}
                      {article.source && <p className="text-xs text-accent font-medium mt-1">{article.source}</p>}
                    </div>
                    <ExternalLink size={14} className="text-muted-foreground flex-shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </Section>
          )}

          {discussionsData?.exists && discussionsData.discussions.length > 0 && (
            <Section title="Community" icon={<SiReddit size={20} className="text-orange-500" />}>
              <div className="space-y-2">
                {discussionsData.discussions.slice(0, 5).map((discussion: any, index: number) =>
                  discussion.url ? (
                    <a
                      key={index}
                      href={discussion.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-card rounded-2xl border border-border p-4 flex items-start gap-3 hover:border-orange-300 transition-colors"
                    >
                      <p className="flex-1 text-sm text-foreground line-clamp-2">{discussion.title}</p>
                      <ExternalLink size={14} className="text-muted-foreground flex-shrink-0 mt-1" />
                    </a>
                  ) : (
                    <p key={index} className="bg-card rounded-2xl border border-border p-4 text-sm text-foreground">{discussion.title}</p>
                  ),
                )}
              </div>
            </Section>
          )}

          {user?.isAdmin && (
            <details className="rounded-2xl border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Wrench size={15} /> Operator tools
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["Refresh prices", () => refreshPrices.mutateAsync(id), refreshPrices.isPending],
                  ["Refresh videos", () => refreshInfluencers.mutateAsync(id), refreshInfluencers.isPending],
                  ["Refresh image", () => refreshImage.mutateAsync(id), refreshImage.isPending],
                  ["Trust score", () => calculateTrustScore.mutateAsync(id), calculateTrustScore.isPending],
                  ["Review summary", () => generateReviewSummary.mutateAsync(id), generateReviewSummary.isPending],
                ].map(([label, fn, pending]) => (
                  <Button key={label as string} size="sm" variant="outline" className="gap-2" disabled={pending as boolean} onClick={() => runTool(label as string, fn as () => Promise<any>)}>
                    <RefreshCw size={13} className={pending ? "animate-spin" : ""} /> {label as string}
                  </Button>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <PriceBar
        offers={offers}
        onBuy={handleBuy}
        tracking={!!tracker}
        onToggleAlert={handleToggleAlert}
        alertBusy={createPriceTracker.isPending || deletePriceTracker.isPending}
      />

      <CheckoutSheet
        open={!!checkoutOffer}
        onOpenChange={(o) => !o && setCheckoutOffer(null)}
        offer={checkoutOffer}
        variants={variants}
        initialVariantId={selectedVariantId}
        country={product.country === "IN" ? "IN" : "US"}
        productName={product.name}
      />

      <Drawer open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DrawerContent className="bg-black border-black">
          <DrawerTitle className="sr-only">{playing?.title ?? "Creator video"}</DrawerTitle>
          {playing && (
            <div className="p-4" style={{ paddingBottom: "calc(var(--safe-area-bottom) + 16px)" }}>
              <div className="relative w-full aspect-video rounded-xl overflow-hidden">
                <iframe
                  src={`${playing.embedUrl}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
                  title={playing.title ?? "Creator video"}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="mt-3 text-white text-sm font-medium">{playing.title}</p>
              <p className="text-white/60 text-xs">{playing.creatorName}</p>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
