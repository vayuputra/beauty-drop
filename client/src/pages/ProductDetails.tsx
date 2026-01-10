import { useProduct, useTrackClick } from "@/hooks/use-drops";
import { Link, useRoute } from "wouter";
import { Loader } from "@/components/Loader";
import { ArrowLeft, ExternalLink, Play, ShoppingBag, TrendingUp, Info } from "lucide-react";
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

        {/* Video Section */}
        {product.videos && product.videos.length > 0 && (
          <div className="mb-10">
            <h3 className="font-display text-xl font-bold mb-4">Watch Reviews</h3>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {product.videos.map((video: any) => (
                <a 
                  key={video.id} 
                  href={video.videoUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-shrink-0 relative w-40 aspect-[9/16] rounded-xl overflow-hidden group shadow-md"
                >
                  <img 
                    src={video.thumbnailUrl || "https://placehold.co/400x600/black/white?text=Video"} 
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                      <Play size={20} fill="white" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-[10px] text-white font-medium line-clamp-2">{video.title}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
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
