import { motion } from "framer-motion";

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-secondary ${className}`} />;
}

/** Skeleton shaped like the Today feed, so content fades into place instead of popping in. */
function FeedSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your feed">
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
            <Shimmer className="h-16 w-16 !rounded-full" />
            <Shimmer className="h-2.5 w-12" />
          </div>
        ))}
      </div>
      <Shimmer className="aspect-[4/5] w-full rounded-[1.75rem]" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Shimmer className="aspect-[4/5] w-full" />
            <Shimmer className="h-3 w-3/4" />
            <Shimmer className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Loader({ variant = "spinner" }: { variant?: "spinner" | "feed" }) {
  if (variant === "feed") return <FeedSkeleton />;
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] w-full" role="status">
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="w-16 h-16 rounded-full bg-primary/30 flex items-center justify-center backdrop-blur-sm"
      >
        <div className="w-8 h-8 rounded-full bg-accent" />
      </motion.div>
      <p className="mt-4 text-sm font-medium text-muted-foreground tracking-widest uppercase">
        Loading Beauty...
      </p>
    </div>
  );
}
