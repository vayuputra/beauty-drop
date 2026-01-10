import { useProduct, useTrackClick } from "@/hooks/use-drops";
import { Link, useRoute } from "wouter";
import { Loader } from "@/components/Loader";
import { ArrowLeft, ExternalLink, Play, TrendingUp, Users } from "lucide-react";
import { SiYoutube, SiTiktok, SiInstagram } from "react-icons/si";
import { motion } from "framer-motion";
import { clsx } from "clsx";

export default function ProductDetails() {
  const [, params] = useRoute("/product/:id");
  const id = params ? parseInt(params.id) : 0;
  
  const { data: product, isLoading } = useProduct(id);
  const trackClick = useTrackClick();

  if (isLoading) return <div className="min-h-screen bg-background"><Loader /></div>;
  if (!product) return <div className="p-8 text-center">Product not found</div>;

  const handleOfferClick = (offer: any) => {
    trackClick.mutate({
      productId: product.id,
      retailerId: offer.retailer.id,
      // In a real app we'd need userId here too if schema requires it, 
      // but schema says references() not notNull() so might be optional or inferred by session in backend
    });
    window.open(offer.affiliateUrl, '_blank');
  };

  const imageUrl = product.imageUrl || "https://placehold.co/600x600/fce7f3/db2777?text=Beauty+Drop";

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero Image */}
      <div className="relative aspect-[4/5] w-full bg-secondary overflow-hidden">
        <Link href="/" className="absolute top-12 left-6 z-20 h-10 w-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-foreground hover:scale-110 transition-transform">
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
          
          <h1 className="font-display text-3xl font-bold text-foreground leading-tight mb-4">
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

        {/* Video Section with Influencer Info */}
        {product.videos && product.videos.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-10"
          >
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-accent" />
              <h3 className="font-display text-xl font-bold">Creator Reviews</h3>
            </div>
            <div className="space-y-4">
              {product.videos.map((video: any) => {
                const PlatformIcon = video.platform === 'youtube' ? SiYoutube 
                  : video.platform === 'tiktok' ? SiTiktok 
                  : SiInstagram;
                const platformColor = video.platform === 'youtube' ? 'text-red-500'
                  : video.platform === 'tiktok' ? 'text-foreground'
                  : 'text-pink-500';
                
                return (
                  <a 
                    key={video.id} 
                    href={video.videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex gap-4 bg-white p-3 rounded-xl border border-border shadow-sm hover:border-accent/50 transition-colors group"
                    data-testid={`video-card-${video.id}`}
                  >
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 w-24 aspect-[9/16] rounded-lg overflow-hidden">
                      <img 
                        src={video.thumbnailUrl || "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&h=300&fit=crop"} 
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                          <Play size={14} fill="white" className="text-white ml-0.5" />
                        </div>
                      </div>
                      {/* Platform Badge */}
                      <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center ${platformColor}`}>
                        <PlatformIcon size={12} />
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0 py-1">
                      <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">
                        {video.title}
                      </p>
                      
                      {/* Creator Info */}
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                          {video.creatorName?.charAt(0) || 'C'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {video.creatorName || 'Creator'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {video.creatorHandle} • {video.creatorFollowers} followers
                          </p>
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Offers / Price Comparison */}
        <div>
          <h3 className="font-display text-xl font-bold mb-4">Shop Now</h3>
          <div className="space-y-3">
            {product.offers && product.offers.length > 0 ? (
              product.offers.map((offer: any) => (
                <div 
                  key={offer.id} 
                  className="bg-white p-4 rounded-xl border border-border shadow-sm flex items-center justify-between group hover:border-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Retailer Logo or Initial */}
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
                        In Stock • Verified
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-lg">
                      {offer.currency === 'USD' ? '$' : '₹'}{offer.price}
                    </span>
                    <button
                      onClick={() => handleOfferClick(offer)}
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
