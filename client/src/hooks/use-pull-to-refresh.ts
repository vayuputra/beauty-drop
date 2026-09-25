import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

const THRESHOLD = 72;

/**
 * Pull-to-refresh for touch screens: dragging down from the very top of the
 * page past a threshold calls `onRefresh`. Returns how far the user has pulled
 * (for the indicator) and whether a refresh is running.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
      armed.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const distance = Math.max(0, e.touches[0].clientY - startY.current);
      const eased = Math.min(110, distance * 0.5);
      setPull(eased);
      if (eased >= THRESHOLD && !armed.current) {
        armed.current = true;
        haptic();
      } else if (eased < THRESHOLD) {
        armed.current = false;
      }
    };
    const onEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (armed.current) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          await refreshRef.current();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refreshing]);

  return { pull, refreshing, ready: pull >= THRESHOLD };
}
