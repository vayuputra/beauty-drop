import { useAnalyticsClicks, useAnalyticsOverview } from "@/hooks/use-drops";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { ArrowLeft, MousePointerClick, Package, Users, Heart, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function Analytics() {
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview();
  const { data: clickData, isLoading: clicksLoading } = useAnalyticsClicks(30);

  const isLoading = overviewLoading || clicksLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md px-6 pt-12 pb-4 border-b border-border/40">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/settings" className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-display text-2xl font-bold">Analytics</h1>
              <p className="text-xs text-muted-foreground">Affiliate performance dashboard</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-6 space-y-6">
        {isLoading ? (
          <Loader />
        ) : (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Package}
                label="Products"
                value={overview?.totalProducts || 0}
                color="bg-blue-100 text-blue-600"
                delay={0}
              />
              <StatCard
                icon={Users}
                label="Users"
                value={overview?.totalUsers || 0}
                color="bg-purple-100 text-purple-600"
                delay={0.05}
              />
              <StatCard
                icon={MousePointerClick}
                label="Clicks (24h)"
                value={overview?.clicksLast24h || 0}
                color="bg-green-100 text-green-600"
                delay={0.1}
              />
              <StatCard
                icon={Heart}
                label="Favorites"
                value={overview?.totalFavorites || 0}
                color="bg-pink-100 text-pink-600"
                delay={0.15}
              />
            </div>

            {/* Click Stats */}
            {clickData && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <TrendingUp size={18} className="text-accent" />
                    Top Products (30 days)
                  </h2>
                  <div className="bg-card rounded-xl border divide-y divide-border overflow-hidden">
                    {clickData.topProducts?.length > 0 ? (
                      clickData.topProducts.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{item.productName}</p>
                              <p className="text-xs text-muted-foreground">{item.brand}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-accent">{item.clickCount} clicks</span>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-sm text-muted-foreground">No click data yet</div>
                    )}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h2 className="font-semibold text-lg mb-3">Clicks by Retailer</h2>
                  <div className="bg-card rounded-xl border divide-y divide-border overflow-hidden">
                    {clickData.byRetailer?.length > 0 ? (
                      clickData.byRetailer.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3">
                          <span className="text-sm font-medium">{item.retailerName}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent rounded-full"
                                style={{
                                  width: `${Math.min(100, (item.clickCount / (clickData.totalClicks || 1)) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs font-bold text-muted-foreground w-8 text-right">{item.clickCount}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-sm text-muted-foreground">No retailer data yet</div>
                    )}
                  </div>
                </motion.div>

                {/* Daily trend */}
                {clickData.byDay?.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <h2 className="font-semibold text-lg mb-3">Daily Clicks</h2>
                    <div className="bg-card rounded-xl border p-4">
                      <div className="flex items-end gap-1 h-32">
                        {clickData.byDay.slice(-14).map((day: any, i: number) => {
                          const max = Math.max(...clickData.byDay.slice(-14).map((d: any) => d.clickCount), 1);
                          const height = (day.clickCount / max) * 100;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                              <span className="text-[9px] text-muted-foreground">{day.clickCount}</span>
                              <div
                                className="w-full bg-accent/80 rounded-t-sm min-h-[2px]"
                                style={{ height: `${height}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-[9px] text-muted-foreground">14 days ago</span>
                        <span className="text-[9px] text-muted-foreground">Today</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="text-center text-xs text-muted-foreground pt-4 pb-8">
                  Total clicks in last {clickData.period}: <strong>{clickData.totalClicks}</strong>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, delay }: {
  icon: any; label: string; value: number; color: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-card rounded-xl border p-4"
    >
      <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center mb-3`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </motion.div>
  );
}
