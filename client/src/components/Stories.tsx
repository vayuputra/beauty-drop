import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { FeedData } from "@/hooks/use-drops";
import { ProductImage } from "@/components/ProductImage";
import { formatPrice } from "@/lib/format";
import { haptic } from "@/lib/haptics";

type Story = FeedData["stories"][number];

/** Row of circular story bubbles: one per product that creators are reviewing. */
export function StoriesRow({ stories }: { stories: Story[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (stories.length === 0) return null;

  return (
    <>
      <div className="-mx-5 px-5 lg:mx-0 lg:px-0 flex gap-4 overflow-x-auto no-scrollbar horizontal-scroll pb-1" aria-label="Creator stories">
        {stories.map((story, i) => (
          <button
            key={story.product.id}
            onClick={() => {
              haptic();
              setOpen(i);
            }}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[72px] group"
            aria-label={`Watch ${story.videos.length} creator videos about ${story.product.brand} ${story.product.name}`}
          >
            <span className="p-[2.5px] rounded-full bg-gradient-to-tr from-accent via-pink-400 to-amber-300">
              <span className="block p-[2.5px] rounded-full bg-background">
                <ProductImage fallbackLabels={false} product={story.product} className="h-[60px] w-[60px] rounded-full bg-secondary" />
              </span>
            </span>
            <span className="text-[11px] font-medium text-foreground/80 truncate w-full text-center">{story.product.brand}</span>
          </button>
        ))}
      </div>
      <AnimatePresence>
        {open !== null && <StoryViewer stories={stories} startIndex={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </>
  );
}

function StoryViewer({ stories, startIndex, onClose }: { stories: Story[]; startIndex: number; onClose: () => void }) {
  const [storyIndex, setStoryIndex] = useState(startIndex);
  const [videoIndex, setVideoIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [, setLocation] = useLocation();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const story = stories[storyIndex];
  const video = story.videos[videoIndex];

  const go = useCallback(
    (dir: 1 | -1) => {
      setPlaying(false);
      if (dir === 1) {
        if (videoIndex < story.videos.length - 1) return setVideoIndex(videoIndex + 1);
        if (storyIndex < stories.length - 1) {
          setStoryIndex(storyIndex + 1);
          return setVideoIndex(0);
        }
        return onClose();
      }
      if (videoIndex > 0) return setVideoIndex(videoIndex - 1);
      if (storyIndex > 0) {
        setStoryIndex(storyIndex - 1);
        setVideoIndex(stories[storyIndex - 1].videos.length - 1);
      }
    },
    [onClose, stories, story.videos.length, storyIndex, videoIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  const embedSrc = video.embedUrl ? `${video.embedUrl}?autoplay=1&playsinline=1&rel=0&modestbranding=1` : null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] bg-black text-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`${story.product.brand} ${story.product.name} stories`}
      onTouchStart={(e) => (touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose(); // swipe down to close
        else if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col" style={{ paddingTop: "calc(var(--safe-area-top) + 12px)" }}>
        {/* Progress */}
        <div className="flex gap-1 px-3">
          {story.videos.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
              <div className={`h-full bg-white transition-all duration-300 ${i <= videoIndex ? "w-full" : "w-0"}`} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <ProductImage fallbackLabels={false} product={story.product} className="h-9 w-9 rounded-full bg-white/10" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{story.product.brand}</p>
            <p className="text-xs text-white/70 truncate">
              {video.creatorName ?? "Creator"}
              {video.publishedAt && ` · ${formatDistanceToNow(new Date(video.publishedAt), { addSuffix: true })}`}
            </p>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-white/10" aria-label="Close stories">
            <X size={22} />
          </button>
        </div>

        {/* Video */}
        <div className="relative flex-1 flex items-center justify-center px-3">
          <div className="relative w-full aspect-[9/16] max-h-full rounded-2xl overflow-hidden bg-white/5">
            {playing && embedSrc ? (
              <iframe
                key={video.id}
                src={embedSrc}
                title={video.title ?? "Creator video"}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <>
                {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
                {/* Tap zones: left = back, right = next, centre = play */}
                <button className="absolute inset-y-0 left-0 w-1/4" onClick={() => go(-1)} aria-label="Previous video" />
                <button className="absolute inset-y-0 right-0 w-1/4" onClick={() => go(1)} aria-label="Next video" />
                <button
                  onClick={() => (embedSrc ? setPlaying(true) : window.open(video.videoUrl, "_blank", "noopener"))}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-white/90 text-black flex items-center justify-center shadow-xl active:scale-95 transition-transform"
                  aria-label="Play video"
                >
                  <Play size={26} fill="currentColor" className="ml-1" />
                </button>
                <p className="absolute bottom-4 left-4 right-4 text-base font-semibold leading-snug line-clamp-3 drop-shadow">
                  {video.title}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Shop this */}
        <div className="px-4 pt-3" style={{ paddingBottom: "calc(var(--safe-area-bottom) + 16px)" }}>
          <button
            onClick={() => {
              haptic("medium");
              onClose();
              setLocation(`/product/${story.product.id}`);
            }}
            className="w-full flex items-center gap-3 rounded-2xl bg-white text-black p-3 active:scale-[0.99] transition-transform"
          >
            <ProductImage fallbackLabels={false} product={story.product} className="h-12 w-12 rounded-xl bg-black/5 flex-shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold truncate">{story.product.name}</p>
              <p className="text-xs text-black/60">
                {story.product.minPrice != null && story.product.currency
                  ? `See prices · from ${formatPrice(story.product.minPrice, story.product.currency)}`
                  : "See details"}
              </p>
            </div>
            <ChevronRight size={20} className="text-black/50" />
          </button>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
