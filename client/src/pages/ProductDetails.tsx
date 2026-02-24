import { useProduct, useTrackClick, useRefreshInfluencers, useRefreshImage, useTrustScore, useCalculateTrustScore, useReviewSummary, useGenerateReviewSummary, useCreatePriceTracker, usePriceTrackers, useRefreshPrices, useFavoriteIds, useToggleFavorite, useDiscussions } from "@/hooks/use-drops";
import { Link, useRoute } from "wouter";
import { Loader } from "@/components/Loader";
import { ArrowLeft, ExternalLink, Play, TrendingUp, Users, RefreshCw, Sparkles, Bell, BellOff, Heart, Share2 } from "lucide-react";
import { SiYoutube, SiTiktok, SiInstagram, SiReddit } from "react-icons/si";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { TrustBadge, TrustScoreDetails } from "@/components/TrustBadge";
import { ReviewSummary } from "@/components/ReviewSummary";
import { useUser } from "@/hooks/use-user";

function getPlaceholderUrl(brand: string, name: string): string {
  const text = encodeURIComponent(`${brand}\n${name.substring(0, 20)}`);
  return `https://placehold.co/600x600/fce7f3/db2777?text=${text}`;
}

function getProxiedImageUrl(url: string): string {
  if (!url) return '';
  if (url.includes('placehold.co')) return url;
  if (url.includes('unsplash.com')) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export default function ProductDetails() {
  const [, params] = useRoute("/product/:id");
  const id = params ? parseInt(params.id) : 0;
  
  const { data: product, isLoading, refetch } = useProduct(id);
  const trackClick = useTrackClick();
  const refreshInfluencers = useRefreshInfluencers();
  const refreshImage = useRefreshImage();
  const [imgError, setImgError] = useState(false);
  
  const { data: trustScoreData, isLoading: trustLoading } = useTrustScore(id);
  const calculateTrustScore = useCalculateTrustScore();
  const { data: reviewSummaryData, isLoading: reviewLoading } = useReviewSummary(id);
  const generateReviewSummary = useGenerateReviewSummary();
  const { data: user } = useUser();
  const { data: priceTrackers } = usePriceTrackers();
  const createPriceTracker = useCreatePriceTracker();
  const refreshPrices = useRefreshPrices();
  const { data: discussionsData } = useDiscussions(id);
  const { data: favoriteIds } = useFavoriteIds();
  const toggleFavorite = useToggleFavorite();
  const isFavorited = favoriteIds?.includes(id) ?? false;

  if (isLoading) return <div className="min-h-screen bg-background"><Loader /></div>;
  if (!product) return <div className="p-8 text-center">Product not found</div>;

  const handleOfferClick = (offer: any) => {
    trackClick.mutate({
      productId: product.id,
      retailerId: offer.retailer.id,
    });
    window.open(offer.affiliateUrl, '_blank');
  };

  const handleRefreshInfluencers = async () => {
    await refreshInfluencers.mutateAsync(product.id);
    refetch();
  };

  const handleRefreshImage = async () => {
    setImgError(false);
    await refreshImage.mutateAsync(product.id);
    refetch();
  };

  const fallbackUrl = getPlaceholderUrl(product.brand, product.name);
  const rawUrl = product.imageUrl || fallbackUrl;
  const imageUrl = imgError ? fallbackUrl : getProxiedImageUrl(rawUrl);

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

  const allInfluencers = [
    ...(product.influencers || []),
    ...(product.videos || []).map((v: any) => ({
      id: `video-${v.id}`,
      name: v.creatorName,
      handle: v.creatorHandle,
      platform: v.platform,
      followers: v.creatorFollowers,
      videoUrl: v.videoUrl,
      videoTitle: v.title,
      thumbnailUrl: v.thumbnailUrl,
      embedUrl: v.embedUrl
    }))
  ];

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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshImage}
            disabled={refreshImage.isPending}
            data-testid="button-refresh-image"
            className="h-10 w-10 bg-white/80 backdrop-blur-md rounded-full shadow-lg text-foreground hover:bg-white/90 transition-all"
          >
            <RefreshCw size={18} className={refreshImage.isPending ? "animate-spin" : ""} />
          </Button>
        </div>
        
        <img 
          src={imageUrl} 
          alt={product.name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90" />
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
          
          <h1 data-testid="text-product-name" className="font-display text-3xl font-bold text-foreground leading-tight mb-4">
            {product.name}
          </h1>
          
          <p className="text-muted-foreground leading-relaxed">
            {product.description}
          </p>
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
              Discover
            </Button>
          </div>

          {allInfluencers.length > 0 ? (
            <div className="space-y-4">
              {allInfluencers.slice(0, 5).map((influencer: any, index: number) => {
                const PlatformIcon = getPlatformIcon(influencer.platform);
                const platformColor = getPlatformColor(influencer.platform);
                
                return (
                  <div 
                    key={influencer.id || index}
                    className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden cursor-pointer hover:border-accent/50 transition-colors"
                    data-testid={`influencer-card-${index}`}
                    onClick={() => window.open(influencer.videoUrl, '_blank')}
                  >
                    <div className="flex gap-4 p-3">
                      {/* Thumbnail */}
                      <div className="relative flex-shrink-0 w-20 aspect-video rounded-lg overflow-hidden bg-secondary">
                        {influencer.thumbnailUrl ? (
                          <img 
                            src={influencer.thumbnailUrl} 
                            alt={influencer.videoTitle || influencer.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <PlatformIcon size={24} className={platformColor} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <div className="w-6 h-6 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center">
                            <Play size={10} fill="white" className="text-white ml-0.5" />
                          </div>
                        </div>
                        {/* Platform Badge */}
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center ${platformColor}`}>
                          <PlatformIcon size={10} />
                        </div>
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
                            {influencer.name?.charAt(0) || 'I'}
                          </div>
                          <p className="text-sm font-semibold text-foreground truncate">
                            {influencer.name || 'Influencer'}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mb-1">
                          {influencer.handle} {influencer.followers && `• ${influencer.followers}`}
                        </p>
                        {influencer.videoTitle && (
                          <p className="text-xs text-foreground/70 line-clamp-1">
                            {influencer.videoTitle}
                          </p>
                        )}
                      </div>
                      
                      {/* External link indicator */}
                      <div className="flex items-center">
                        <ExternalLink size={14} className="text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 bg-secondary/30 rounded-xl text-center">
              <Users size={32} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mb-3">
                No video reviews yet. Click "Discover" to find creators talking about this product.
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
              onClick={() => refreshPrices.mutate(id)}
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
            {product.offers && product.offers.length > 0 ? (
              product.offers.map((offer: any) => (
                <div 
                  key={offer.id} 
                  data-testid={`card-offer-${offer.id}`}
                  className="bg-white dark:bg-card p-4 rounded-xl border border-border shadow-sm flex items-center justify-between group hover:border-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-lg text-secondary-foreground overflow-hidden">
                      {offer.retailer.logoUrl ? (
                        <img src={offer.retailer.logoUrl} alt={offer.retailer.name} className="w-full h-full object-cover" />
                      ) : (
                        offer.retailer.name.charAt(0)
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{offer.retailer.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        In Stock
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-lg">
                      {offer.currency === 'USD'
                        ? `$${Number(offer.price).toFixed(2)}`
                        : `₹${Number(offer.price).toLocaleString('en-IN')}`}
                    </span>
                    <button
                      onClick={() => handleOfferClick(offer)}
                      data-testid={`button-buy-${offer.id}`}
                      className="bg-foreground text-background px-4 py-2 rounded-lg font-bold text-sm hover:bg-accent hover:text-white transition-colors flex items-center gap-2"
                    >
                      Buy <ExternalLink size={14} />
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
