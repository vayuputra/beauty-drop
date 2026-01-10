import { useProduct, useTrackClick, useRefreshInfluencers } from "@/hooks/use-drops";
import { Link, useRoute } from "wouter";
import { Loader } from "@/components/Loader";
import { ArrowLeft, ExternalLink, Play, TrendingUp, Users, RefreshCw, Sparkles } from "lucide-react";
import { SiYoutube, SiTiktok, SiInstagram, SiReddit } from "react-icons/si";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function ProductDetails() {
  const [, params] = useRoute("/product/:id");
  const id = params ? parseInt(params.id) : 0;
  
  const { data: product, isLoading, refetch } = useProduct(id);
  const trackClick = useTrackClick();
  const refreshInfluencers = useRefreshInfluencers();

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

  const imageUrl = product.imageUrl || "https://placehold.co/600x600/fce7f3/db2777?text=Beauty+Drop";

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
    <div className="min-h-screen bg-background pb-32">
      {/* Hero Image */}
      <div className="relative aspect-[4/5] w-full bg-secondary overflow-hidden">
        <Link href="/" data-testid="button-back" className="absolute top-12 left-6 z-20 h-10 w-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-foreground hover:scale-110 transition-transform">
          <ArrowLeft size={20} />
        </Link>
        
        <img 
          src={imageUrl} 
          alt={product.name}
          className="w-full h-full object-cover"
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

        {/* Influencer Section with Video Embeds */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-accent" />
              <h3 className="font-display text-xl font-bold">Top Influencers</h3>
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
                No influencer data yet. Click "Discover" to find creators talking about this product.
              </p>
            </div>
          )}
        </motion.div>

        {/* Offers / Price Comparison */}
        <div>
          <h3 className="font-display text-xl font-bold mb-4">Shop Now</h3>
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
                      {offer.currency === 'USD' ? '$' : '₹'}{offer.price}
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
