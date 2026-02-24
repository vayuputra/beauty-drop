import { useWeeklyDigest } from "@/hooks/use-drops";
import { useUser } from "@/hooks/use-user";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { ArrowLeft, TrendingDown, TrendingUp, MessageCircle, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function Digest() {
  const { data: user } = useUser();
  const { data: digest, isLoading } = useWeeklyDigest(user?.country || undefined);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md px-6 pt-12 pb-4 border-b border-border/40">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-display text-2xl font-bold">Weekly Digest</h1>
              <p className="text-xs text-muted-foreground">Your beauty roundup for the week</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-6 space-y-6">
        {isLoading ? (
          <Loader />
        ) : digest ? (
          <>
            {/* Date range */}
            {digest.weekRange && (
              <div className="text-center text-sm text-muted-foreground">
                {digest.weekRange}
              </div>
            )}

            {/* Top Price Movers */}
            {digest.priceMovers && digest.priceMovers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <TrendingDown size={18} className="text-green-500" />
                  Price Movers
                </h2>
                <div className="space-y-2">
                  {digest.priceMovers.map((item: any, i: number) => (
                    <Link key={i} href={`/product/${item.productId}`}>
                      <div className="bg-card rounded-xl border p-4 flex items-center justify-between hover:border-accent/30 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.brand}</p>
                        </div>
                        <div className={`flex items-center gap-1 ${item.change < 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {item.change < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                          <span className="text-sm font-bold">{Math.abs(item.change).toFixed(1)}%</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Trending Products */}
            {digest.trending && digest.trending.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Sparkles size={18} className="text-yellow-500" />
                  Most Talked About
                </h2>
                <div className="space-y-2">
                  {digest.trending.map((item: any, i: number) => (
                    <Link key={i} href={`/product/${item.productId}`}>
                      <div className="bg-card rounded-xl border p-4 flex items-center gap-3 hover:border-accent/30 transition-colors cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold text-sm">
                          #{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.brand}</p>
                        </div>
                        {item.mentionCount > 0 && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MessageCircle size={12} />
                            <span className="text-xs">{item.mentionCount}</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}

            {/* New Products */}
            {digest.newProducts && digest.newProducts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Sparkles size={18} className="text-accent" />
                  New This Week
                </h2>
                <div className="space-y-2">
                  {digest.newProducts.map((item: any, i: number) => (
                    <Link key={i} href={`/product/${item.productId}`}>
                      <div className="bg-card rounded-xl border p-4 hover:border-accent/30 transition-colors cursor-pointer">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.brand} · {item.category}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Summary */}
            {digest.summary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-primary/10 rounded-2xl p-5 border border-primary/20"
              >
                <h3 className="font-semibold text-sm mb-2">This Week's Summary</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">{digest.summary}</p>
              </motion.div>
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <Sparkles size={48} className="mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Digest Available</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              The weekly digest will be available once we have enough product data and activity to summarize.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
