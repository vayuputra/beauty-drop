import { useProduct, useRefreshInfluencers, useRefreshImage, useTrustScore, useCalculateTrustScore, useReviewSummary, useGenerateReviewSummary, useCreatePriceTracker, usePriceTrackers, useRefreshPrices, useFavoriteIds, useToggleFavorite, useDiscussions, useArticles } from "@/hooks/use-drops";
import { Link, useRoute } from "wouter";
import { useState } from "react";
import { Loader } from "@/components/Loader";
import { ArrowLeft, ExternalLink, Play, TrendingUp, Users, RefreshCw, Sparkles, Bell, BellOff, Heart, Share2, Newspaper } from "lucide-react";
import { SiYoutube, SiTiktok, SiInstagram, SiReddit } from "react-icons/si";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TrustBadge, TrustScoreDetails } from "@/components/TrustBadge";
import { ReviewSummary } from "@/components/ReviewSummary";
import { ProductImage } from "@/components/ProductImage";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import { formatPrice, offerSourceLabel, sortOffers } from "@/lib/format";

/** Retailer logo with a letter avatar when there is no logo or it fails to load. */
function RetailerLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-secondary flex items-center justify-center font-bold text-lg text-secondary-foreground overflow-hidden">
      {logoUrl && !failed ? (
        <img src={logoUrl} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{name.charAt(0)}</span>
      )}
    </div>
  );
}

export default function ProductDetails() {
  const [, params] = useRoute("/product/:id");
  const id = params ? parseInt(params.id) : 0;
  
  const { data: product, isLoading, refetch } = useProduct(id);
  const refreshInfluencers = useRefreshInfluencers();
  const refreshImage = useRefreshImage();

  const { data: trustScoreData, isLoading: trustLoading } = useTrustScore(id);
  const calculateTrustScore = useCalculateTrustScore();
  const { data: reviewSummaryData, isLoading: reviewLoading } = useReviewSummary(id);
  const generateReviewSummary = useGenerateReviewSummary();
  const { data: user } = useUser();
  const { data: priceTrackers } = usePriceTrackers();
  const createPriceTracker = useCreatePriceTracker();
  const refreshPrices = useRefreshPrices();
  const { data: discussionsData } = useDiscussions(id);
  const { data: articlesData } = useArticles(id);
  const { data: favoriteIds } = useFavoriteIds();
  const toggleFavorite = useToggleFavorite();
  const isFavorited = favoriteIds?.includes(id) ?? false;
  const { toast } = useToast();

  if (isLoading) return <div className="min-h-screen bg-background"><Loader /></div>;
  if (!product) return <div className="p-8 text-center">Product not found</div>;

  // The server records the click and redirects to the retailer (with its app deep link where supported).
  const handleOfferClick = (offer: any) => {
    window.open(apiUrl(`/api/go/${offer.id}`), "_blank", "noopener");
  };

  const handleRefreshPrices = async () => {
    try {
      const result = await refreshPrices.mutateAsync(id);
      toast({ title: result.message ?? (result.success ? "Prices updated" : "Prices unchanged") });
    } catch {
      toast({ title: "Couldn't refresh prices", description: "Please try again later.", variant: "destructive" });
    }
  };

  const sortedOffers = sortOffers<any>(product.offers ?? []);
  const buyableCount = sortedOffers.filter((o: any) => o.inStock !== false).length;
  const variants: any[] = product.variants ?? [];

  const handleRefreshInfluencers = async () => {
    await refreshInfluencers.mutateAsync(product.id);
    refetch();
  };

  const handleRefreshImage = async () => {
    await refreshImage.mutateAsync(product.id);
    refetch();
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

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'youtube': return SiYoutube;
      case 'tiktok': return SiTiktok;
      case 'instagram': return SiInstagram;
      case 'reddit': return SiReddit;
      default: return SiYoutube;
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'youtube': return 'text-red-500';
      case 'tiktok': return 'text-foreground';
      case 'instagram': return 'text-pink-500';
      case 'reddit': return 'text-orange-500';
      default: return 'text-foreground';
    }
  };

  const videos: any[] = product.videos ?? [];

  return (
    <div className="min-h-screen bg-background pb-32 momentum-scroll">
      {/* Hero Image */}
      <div className="relative aspect-[4/5] w-full bg-secondary overflow-hidden">
        <Link href="/" data-testid="button-back" className="absolute top-12 left-6 z-20 h-10 w-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-foreground hover:scale-110 transition-transform">
          <ArrowLeft size={20} />
        </Link>
        
        <div className="absolute top-12 right-6 z-20 flex gap-2">
          <button
            onClick={() => toggleFavorite.mutate({ productId: product.id, isFavorited })}
            className="h-10 w-10 bg-white/80 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
            aria-label={isFavorited ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart size={18} className={isFavorited ? "text-red-500 fill-red-500" : "text-foreground"} />
          </button>
          <button
            onClick={handleShare}
            className="h-10 w-10 bg-white/80 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
            aria-label="Share this product"
          >
            <Share2 size={18} className="text-foreground" />
          </button>
          {user?.isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshImage}
              disabled={refreshImage.isPending}
              data-testid="button-refresh-image"
              aria-label="Refresh product image"
              className="h-10 w-10 bg-white/80 backdrop-blur-md rounded-full shadow-lg text-foreground hover:bg-white/90 transition-all"
            >
              <RefreshCw size={18} className={refreshImage.isPending ? "animate-spin" : ""} />
            </Button>
          )}
        </div>
        
        <ProductImage product={product} priority className="w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90 pointer-events-none" />
      </div>

      <div className="max-w-md mx-auto px-6 -mt-24 relative z-10">
        {/* Title Block */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-accent/10 text-accent px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              {product.brand}
            </span>
            <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              {product.category}
            </span>
          </div>
          
          <h1 data-testid="text-product-name" className="font-display text-3xl font-bold text-foreground leading-tight mb-2">
            {product.name}
          </h1>
          {product.launchedAt && (
            <p className="text-xs font-medium uppercase tracking-wider text-accent mb-4">
              Launched {format(new Date(product.launchedAt), "d MMM yyyy")}
            </p>
          )}
          {!product.launchedAt && <div className="mb-2" />}
          
          <p className="text-muted-foreground leading-relaxed">
            {product.description}
          </p>

          {variants.length > 1 && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {variants.length} shades &amp; sizes
              </p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                {variants.map((v) => (
                  <span
                    key={v.id}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                      v.available === false
                        ? "border-border text-muted-foreground/60 line-through"
                        : "border-foreground/20 text-foreground bg-white"
                    }`}
                    title={v.available === false ? "Sold out" : undefined}
                  >
                    {v.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Why Trending */}
        {product.whyTrending && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-primary/20 p-5 rounded-2xl border border-primary/30 mb-8"
          >
            <div className="flex items-center gap-2 mb-2 text-accent-foreground font-semibold">
              <TrendingUp size={18} />
              <h3 className="uppercase tracking-wide text-xs">Why it's trending</h3>
            </div>
            <p className="text-foreground/80 text-sm font-medium">
              {product.whyTrending}
            </p>
          </motion.div>
        )}

        {/* Influencer Section with Video Embeds - MOVED UP */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-accent" />
              <h3 className="font-display text-xl font-bold">Product Videos</h3>
            </div>
            {user?.isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshInfluencers}
                disabled={refreshInfluencers.isPending}
                data-testid="button-refresh-influencers"
                className="gap-2"
              >
                {refreshInfluencers.isPending ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Refresh
              </Button>
            )}
          </div>

          {videos.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar horizontal-scroll -mx-6 px-6 pb-2">
              {videos.slice(0, 6).map((video, index) => {
                const PlatformIcon = getPlatformIcon(video.platform);
                return (
                  <a
                    key={video.id}
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-60 group"
                    data-testid={`video-card-${index}`}
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-secondary">
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PlatformIcon size={28} className={getPlatformColor(video.platform)} />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                        <div className="w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow">
                          <Play size={16} fill="currentColor" className="text-foreground ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground line-clamp-2 leading-snug">{video.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {video.creatorName}
                      {video.publishedAt && ` · ${formatDistanceToNow(new Date(video.publishedAt), { addSuffix: true })}`}
                    </p>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="p-6 bg-secondary/30 rounded-xl text-center">
              <Users size={32} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No creator videos yet. They'll show up here as people review it.
              </p>
            </div>
          )}
        </motion.div>

        {/* Trust Score Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8"
        >
          {trustScoreData?.exists ? (
            <TrustScoreDetails data={{
              trustScore: trustScoreData.trustScore,
              label: trustScoreData.label,
              color: trustScoreData.color,
              redditSentimentScore: trustScoreData.redditSentimentScore,
              engagementAuthenticityScore: trustScoreData.engagementAuthenticityScore,
              redditMentions: trustScoreData.redditMentions
            }} />
          ) : (
            <div className="bg-card rounded-xl p-4 border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Trust Score</h3>
                  <p className="text-sm text-muted-foreground">Analyze Reddit sentiment & engagement authenticity</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => calculateTrustScore.mutate(id)}
                  disabled={calculateTrustScore.isPending}
                  data-testid="button-calculate-trust"
                  className="gap-2"
                >
                  {calculateTrustScore.isPending ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  Calculate
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* AI Review Summary Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mb-8"
        >
          {reviewSummaryData?.exists ? (
            <ReviewSummary data={{
              summaryText: reviewSummaryData.summaryText,
              climateSuitability: reviewSummaryData.climateSuitability,
              skinTypeMatch: reviewSummaryData.skinTypeMatch,
              prosHighlights: reviewSummaryData.prosHighlights,
              consHighlights: reviewSummaryData.consHighlights,
              sources: reviewSummaryData.sources
            }} />
          ) : (
            <div className="bg-card rounded-xl p-4 border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">AI Review Summary</h3>
                  <p className="text-sm text-muted-foreground">Get climate & skin type recommendations</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateReviewSummary.mutate(id)}
                  disabled={generateReviewSummary.isPending}
                  data-testid="button-generate-summary"
                  className="gap-2"
                >
                  {generateReviewSummary.isPending ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  Generate
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Community Discussions Section */}
        {discussionsData?.exists && discussionsData.discussions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <SiReddit size={18} className="text-orange-500" />
              <h3 className="font-display text-xl font-bold">Community Discussions</h3>
              {discussionsData.mentionCount > 0 && (
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {discussionsData.mentionCount} mentions
                </span>
              )}
            </div>
            <div className="space-y-2">
              {discussionsData.discussions.slice(0, 5).map((discussion: any, index: number) => (
                <div
                  key={index}
                  className="bg-white dark:bg-card rounded-xl border border-border p-3 flex items-start gap-3 cursor-pointer hover:border-orange-300 transition-colors"
                  onClick={() => discussion.url && window.open(discussion.url, '_blank')}
                >
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <SiReddit size={16} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{discussion.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">Reddit</p>
                  </div>
                  {discussion.url && <ExternalLink size={14} className="text-muted-foreground flex-shrink-0 mt-1" />}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Articles Section */}
        {articlesData?.exists && articlesData.articles?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <Newspaper size={18} className="text-blue-500" />
              <h3 className="font-display text-xl font-bold">Articles & Reviews</h3>
            </div>
            <div className="space-y-2">
              {articlesData.articles.slice(0, 6).map((article: any, index: number) => (
                <div
                  key={index}
                  className="bg-white dark:bg-card rounded-xl border border-border p-3 flex items-start gap-3 cursor-pointer hover:border-blue-300 transition-colors"
                  onClick={() => article.url && window.open(article.url, '_blank')}
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Newspaper size={14} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2">{article.title}</p>
                    {article.snippet && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.snippet}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {article.source && (
                        <span className="text-xs text-blue-600 font-medium">{article.source}</span>
                      )}
                      {article.publishedAt && (
                        <span className="text-xs text-muted-foreground">{article.publishedAt}</span>
                      )}
                    </div>
                  </div>
                  {article.url && <ExternalLink size={14} className="text-muted-foreground flex-shrink-0 mt-1" />}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Price Tracker Section */}
        {user && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.19 }}
            className="mb-8"
          >
            {(() => {
              const isTracking = priceTrackers?.some((t: any) => t.productId === id);
              return (
                <div className="bg-card rounded-xl p-4 border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isTracking ? (
                        <Bell size={18} className="text-primary" />
                      ) : (
                        <BellOff size={18} className="text-muted-foreground" />
                      )}
                      <div>
                        <h3 className="font-semibold text-foreground">Price Alerts</h3>
                        <p className="text-sm text-muted-foreground">
                          {isTracking ? 'You\'ll be notified on price drops' : 'Get notified when price drops'}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isTracking ? "secondary" : "default"}
                      onClick={() => !isTracking && createPriceTracker.mutate({ productId: id, notifyOnAnyDrop: true })}
                      disabled={isTracking || createPriceTracker.isPending}
                      data-testid="button-track-price"
                      className="gap-2"
                    >
                      {createPriceTracker.isPending ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : isTracking ? (
                        'Tracking'
                      ) : (
                        'Track Price'
                      )}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* Offers / Price Comparison */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold">Shop Now</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshPrices}
              disabled={refreshPrices.isPending}
              data-testid="button-refresh-prices"
              className="gap-2"
            >
              {refreshPrices.isPending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Refresh Prices
            </Button>
          </div>
          <div className="space-y-3">
            {sortedOffers.length > 0 ? (
              sortedOffers.map((offer: any, index: number) => (
                <div 
                  key={offer.id} 
                  data-testid={`card-offer-${offer.id}`}
                  className="bg-white dark:bg-card p-4 rounded-xl border border-border shadow-sm flex items-center justify-between group hover:border-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <RetailerLogo name={offer.retailer.name} logoUrl={offer.retailer.logoUrl} />
                    <div>
                      <p className="font-semibold text-foreground">{offer.retailer.name}</p>
                      {offer.inStock === false ? (
                        <p className="text-xs font-semibold text-destructive">Sold out</p>
                      ) : (
                        index === 0 && buyableCount > 1 && (
                          <p className="text-xs text-accent font-semibold">Best price</p>
                        )
                      )}
                      <p className="text-xs text-muted-foreground">
                        {[
                          offerSourceLabel(offer.source, offer.retailer.kind),
                          offer.source === "demo" || !offer.lastUpdated
                            ? "Price not yet verified"
                            : `Checked ${formatDistanceToNow(new Date(offer.lastUpdated), { addSuffix: true })}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className={`block font-bold text-lg ${offer.inStock === false ? "text-muted-foreground" : ""}`}>
                        {formatPrice(Number(offer.price), offer.currency)}
                      </span>
                      {offer.listPrice && offer.listPrice > offer.price && (
                        <span className="block text-xs text-muted-foreground line-through">
                          {formatPrice(Number(offer.listPrice), offer.currency)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleOfferClick(offer)}
                      data-testid={`button-buy-${offer.id}`}
                      className="bg-foreground text-background px-4 py-2 rounded-lg font-bold text-sm hover:bg-accent hover:text-white transition-colors flex items-center gap-2"
                    >
                      {offer.inStock === false ? "View" : "Buy"} <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 bg-secondary/50 rounded-xl text-center text-muted-foreground text-sm">
                No offers currently available.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
