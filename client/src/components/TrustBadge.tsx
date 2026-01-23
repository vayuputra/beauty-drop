import { Shield, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrustBadgeProps {
  score: number;
  label: string;
  color: string;
  compact?: boolean;
  className?: string;
}

export function TrustBadge({ score, label, color, compact = false, className }: TrustBadgeProps) {
  const getColorClasses = () => {
    switch (color) {
      case 'green':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800';
      case 'emerald':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'yellow':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
      case 'orange':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
      case 'red':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getIcon = () => {
    if (score >= 80) return ShieldCheck;
    if (score >= 60) return Shield;
    if (score >= 40) return ShieldQuestion;
    return ShieldAlert;
  };

  const Icon = getIcon();

  if (compact) {
    return (
      <div 
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium",
          getColorClasses(),
          className
        )}
        data-testid="trust-badge-compact"
      >
        <Icon size={12} />
        <span>{score}</span>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border",
        getColorClasses(),
        className
      )}
      data-testid="trust-badge"
    >
      <Icon size={16} />
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{score}/100</span>
        <span className="text-xs opacity-80">{label}</span>
      </div>
    </div>
  );
}

interface TrustScoreData {
  trustScore: number;
  label: string;
  color: string;
  redditSentimentScore?: number | null;
  engagementAuthenticityScore?: number | null;
  redditMentions?: number | null;
}

export function TrustScoreDetails({ data }: { data: TrustScoreData }) {
  return (
    <div className="bg-card rounded-xl p-4 border" data-testid="trust-score-details">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Trust Score</h3>
        <TrustBadge 
          score={data.trustScore} 
          label={data.label} 
          color={data.color}
        />
      </div>
      
      <div className="space-y-3">
        {data.redditSentimentScore !== null && data.redditSentimentScore !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Reddit Sentiment</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-orange-500 dark:bg-orange-400 rounded-full" 
                  style={{ width: `${data.redditSentimentScore}%` }}
                />
              </div>
              <span className="font-medium text-foreground">{data.redditSentimentScore}%</span>
            </div>
          </div>
        )}
        
        {data.engagementAuthenticityScore !== null && data.engagementAuthenticityScore !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Engagement Authenticity</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 dark:bg-blue-400 rounded-full" 
                  style={{ width: `${data.engagementAuthenticityScore}%` }}
                />
              </div>
              <span className="font-medium text-foreground">{data.engagementAuthenticityScore}%</span>
            </div>
          </div>
        )}
        
        {data.redditMentions !== null && data.redditMentions !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Reddit Mentions</span>
            <span className="font-medium text-foreground">{data.redditMentions} discussions</span>
          </div>
        )}
      </div>
    </div>
  );
}
