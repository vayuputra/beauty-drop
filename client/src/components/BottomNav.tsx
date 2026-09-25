import { Link, useLocation } from "wouter";
import { Sparkles, Search, ShoppingBag, User, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { useFavoriteIds } from "@/hooks/use-drops";

const TABS: { href: string; icon: LucideIcon; label: string; match: (path: string) => boolean }[] = [
  { href: "/", icon: Sparkles, label: "Today", match: (p) => p === "/" },
  { href: "/search", icon: Search, label: "Explore", match: (p) => p.startsWith("/search") },
  { href: "/bag", icon: ShoppingBag, label: "Bag", match: (p) => p.startsWith("/bag") },
  { href: "/settings", icon: User, label: "You", match: (p) => ["/settings", "/notifications", "/compare", "/digest", "/admin", "/analytics", "/addresses"].some((r) => p.startsWith(r)) },
];

export function BottomNav() {
  const [location] = useLocation();
  const { data: favoriteIds } = useFavoriteIds();
  const saved = favoriteIds?.length ?? 0;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-t border-border/60 lg:hidden"
      style={{ paddingBottom: "var(--safe-area-bottom)" }}
      aria-label="Main"
    >
      <div className="flex justify-around items-center max-w-md mx-auto">
        {TABS.map(({ href, icon: Icon, label, match }) => {
          const isActive = match(location);
          return (
            <Link key={href} href={href} className="flex-1" aria-label={label} aria-current={isActive ? "page" : undefined}>
              <div
                className={clsx(
                  "relative flex flex-col items-center justify-center py-2.5 px-2 min-h-[56px] transition-colors duration-200",
                  isActive ? "text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} className={clsx("mb-1 transition-transform", isActive && "scale-110")} />
                <span className="text-[10px] font-semibold tracking-wide uppercase">{label}</span>
                {href === "/bag" && saved > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                    {saved > 9 ? "9+" : saved}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Top navigation for wide screens, where a bottom tab bar feels out of place. */
export function TopNav() {
  const [location] = useLocation();
  return (
    <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
      {TABS.map(({ href, label, match }) => {
        const isActive = match(location);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={clsx(
              "px-4 py-2 rounded-full text-sm font-semibold transition-colors",
              isActive ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
