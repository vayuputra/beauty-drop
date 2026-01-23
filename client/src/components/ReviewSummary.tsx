import { Sparkles, Sun, Droplets, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewSummaryData {
  summaryText: string;
  climateSuitability?: string | null;
  skinTypeMatch?: string | null;
  prosHighlights?: string[] | null;
  consHighlights?: string[] | null;
  sources?: { platform: string; reviewCount: number }[] | null;
}

interface ReviewSummaryProps {
  data: ReviewSummaryData;
  className?: string;
}

export function ReviewSummary({ data, className }: ReviewSummaryProps) {
  return (
    <div className={cn("bg-card rounded-xl p-4 border space-y-4", className)} data-testid="review-summary">
      <div className="flex items-center gap-2 text-foreground">
        <Sparkles size={18} className="text-purple-500 dark:text-purple-400" />
        <h3 className="font-semibold">AI Review Summary</h3>
      </div>
      
      <p className="text-sm text-muted-foreground leading-relaxed">
        {data.summaryText}
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.climateSuitability && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg" data-testid="climate-suitability">
            <Sun size={16} className="text-orange-500 dark:text-orange-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs font-medium text-orange-700 dark:text-orange-300 uppercase tracking-wide">Climate</span>
              <p className="text-sm text-orange-900 dark:text-orange-200 mt-0.5">{data.climateSuitability}</p>
            </div>
          </div>
        )}
        
        {data.skinTypeMatch && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg" data-testid="skin-type-match">
            <Droplets size={16} className="text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">Skin Type</span>
              <p className="text-sm text-blue-900 dark:text-blue-200 mt-0.5">{data.skinTypeMatch}</p>
            </div>
          </div>
        )}
      </div>
      
      {((data.prosHighlights && data.prosHighlights.length > 0) || 
        (data.consHighlights && data.consHighlights.length > 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {data.prosHighlights && data.prosHighlights.length > 0 && (
            <div data-testid="pros-highlights">
              <div className="flex items-center gap-1.5 mb-2">
                <ThumbsUp size={14} className="text-green-600 dark:text-green-400" />
                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Pros</span>
              </div>
              <ul className="space-y-1.5">
                {data.prosHighlights.map((pro, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500 dark:text-green-400 mt-1">+</span>
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {data.consHighlights && data.consHighlights.length > 0 && (
            <div data-testid="cons-highlights">
              <div className="flex items-center gap-1.5 mb-2">
                <ThumbsDown size={14} className="text-red-600 dark:text-red-400" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">Cons</span>
              </div>
              <ul className="space-y-1.5">
                {data.consHighlights.map((con, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-red-500 dark:text-red-400 mt-1">-</span>
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {data.sources && data.sources.length > 0 && (
        <div className="pt-2 border-t">
          <div className="flex items-center gap-1.5 mb-2">
            <MessageSquare size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sources</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.sources.map((source, i) => (
              <span 
                key={i} 
                className="text-xs px-2 py-1 bg-muted rounded-full text-muted-foreground"
              >
                {source.platform}: ~{source.reviewCount} reviews
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
