import { useState } from "react";
import { useDrops, useCompareProducts } from "@/hooks/use-drops";
import { useUser } from "@/hooks/use-user";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { ArrowLeft, Plus, X, GitCompareArrows, Star } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

function getProxiedImageUrl(url: string): string {
  if (!url) return '';
  if (url.includes('placehold.co') || url.includes('unsplash.com')) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export default function Compare() {
  const { data: user } = useUser();
  const { data: products, isLoading: productsLoading } = useDrops(user?.country || undefined);
  const compareProducts = useCompareProducts();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showSelector, setShowSelector] = useState(false);
  const [, setLocation] = useLocation();

  const toggleProduct = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else if (selectedIds.length < 4) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleCompare = () => {
    if (selectedIds.length >= 2) {
      compareProducts.mutate(selectedIds);
      setShowSelector(false);
    }
  };

  const comparisonData = compareProducts.data?.products;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md px-6 pt-12 pb-4 border-b border-border/40">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/" className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-display text-2xl font-bold">Compare Products</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-13">Select 2-4 products to compare side by side</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-6">
        {/* Product selector slots */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[0, 1, 2, 3].map(slot => {
            const pid = selectedIds[slot];
            const prod = products?.find((p: any) => p.id === pid);
            return (
              <div
                key={slot}
                className="border-2 border-dashed border-border rounded-xl p-3 min-h-[100px] flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 transition-colors relative"
                onClick={() => setShowSelector(true)}
              >
                {prod ? (
                  <>
                    <button
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-secondary flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); toggleProduct(prod.id); }}
                    >
                      <X size={12} />
                    </button>
                    <img
                      src={getProxiedImageUrl(prod.imageUrl)}
                      alt={prod.name}
                      className="w-12 h-12 rounded-lg object-cover mb-1"
                    />
                    <p className="text-xs font-medium text-center line-clamp-2">{prod.name}</p>
                    <p className="text-[10px] text-muted-foreground">{prod.brand}</p>
                  </>
                ) : (
                  <>
                    <Plus size={20} className="text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Add product</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <Button
          className="w-full gap-2 mb-8"
          disabled={selectedIds.length < 2 || compareProducts.isPending}
          onClick={handleCompare}
        >
          {compareProducts.isPending ? (
            <Loader />
          ) : (
            <>
              <GitCompareArrows size={16} />
              Compare {selectedIds.length} Products
            </>
          )}
        </Button>

        {/* Product Selector Modal */}
        {showSelector && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              className="bg-background rounded-t-3xl w-full max-h-[70vh] overflow-y-auto p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Select Products</h3>
                <button onClick={() => setShowSelector(false)} className="p-2">
                  <X size={20} />
                </button>
              </div>
              {productsLoading ? (
                <Loader />
              ) : (
                <div className="space-y-2">
                  {products?.map((product: any) => {
                    const isSelected = selectedIds.includes(product.id);
                    return (
                      <div
                        key={product.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          isSelected ? "border-accent bg-accent/5" : "border-border hover:border-accent/30"
                        }`}
                        onClick={() => toggleProduct(product.id)}
                      >
                        <img
                          src={getProxiedImageUrl(product.imageUrl)}
                          alt={product.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.brand} · {product.category}</p>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? "bg-accent border-accent text-white" : "border-border"
                        }`}>
                          {isSelected && <span className="text-xs font-bold">{selectedIds.indexOf(product.id) + 1}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button className="w-full mt-4" onClick={() => setShowSelector(false)}>
                Done ({selectedIds.length} selected)
              </Button>
            </motion.div>
          </div>
        )}

        {/* Comparison Results */}
        {comparisonData && comparisonData.length >= 2 && (
          <div className="space-y-6">
            {/* Side-by-side cards */}
            <div className="grid grid-cols-2 gap-3">
              {comparisonData.map((product: any) => (
                <div key={product.id} className="bg-card rounded-xl border p-3">
                  <img
                    src={getProxiedImageUrl(product.imageUrl)}
                    alt={product.name}
                    className="w-full aspect-square rounded-lg object-cover mb-2"
                  />
                  <h4 className="text-sm font-semibold line-clamp-2">{product.name}</h4>
                  <p className="text-xs text-muted-foreground mb-2">{product.brand}</p>

                  {product.trustScore && (
                    <div className="flex items-center gap-1 mb-1">
                      <Star size={12} className="text-yellow-500" />
                      <span className="text-xs font-medium">{product.trustScore.score}/100</span>
                      <span className="text-[10px] text-muted-foreground">{product.trustScore.label}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Comparison table */}
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="divide-y divide-border">
                <CompareRow label="Category" values={comparisonData.map((p: any) => p.category)} />
                <CompareRow label="Trust Score" values={comparisonData.map((p: any) =>
                  p.trustScore ? `${p.trustScore.score}/100` : "Not calculated"
                )} />
                <CompareRow label="Reddit Mentions" values={comparisonData.map((p: any) =>
                  p.trustScore?.redditMentions?.toString() || "—"
                )} />
                <CompareRow label="Skin Type" values={comparisonData.map((p: any) =>
                  p.reviewSummary?.skinTypeMatch || "—"
                )} />
                <CompareRow label="Climate" values={comparisonData.map((p: any) =>
                  p.reviewSummary?.climateSuitability || "—"
                )} />
              </div>
            </div>

            {/* Pros & Cons */}
            {comparisonData.map((product: any) => (
              product.reviewSummary && (
                <div key={`review-${product.id}`} className="bg-card rounded-xl border p-4">
                  <h4 className="font-semibold text-sm mb-2">{product.name}</h4>
                  {product.reviewSummary.prosHighlights?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-green-600 mb-1">Pros</p>
                      {product.reviewSummary.prosHighlights.slice(0, 3).map((pro: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">+ {pro}</p>
                      ))}
                    </div>
                  )}
                  {product.reviewSummary.consHighlights?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-600 mb-1">Cons</p>
                      {product.reviewSummary.consHighlights.slice(0, 3).map((con: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">- {con}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid grid-cols-[100px_1fr] divide-x divide-border">
      <div className="p-3 bg-secondary/30 text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`grid grid-cols-${values.length} divide-x divide-border`}>
        {values.map((val, i) => (
          <div key={i} className="p-3 text-xs text-center">{val}</div>
        ))}
      </div>
    </div>
  );
}
