import { Link, useLocation } from "wouter";
import { Home, Search, Heart, User } from "lucide-react";
import { clsx } from "clsx";

export function BottomNav() {
  const [location] = useLocation();

  const NavItem = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = location === href;
    return (
      <Link href={href} className="flex-1">
        <div className={clsx(
          "flex flex-col items-center justify-center py-3 px-2 cursor-pointer transition-all duration-300",
          isActive ? "text-accent" : "text-muted-foreground hover:text-foreground"
        )}>
          <Icon
            size={24}
            strokeWidth={isActive ? 2.5 : 2}
            className={clsx("mb-1 transition-transform", isActive && "scale-110")}
          />
          <span className="text-[10px] font-medium tracking-wide uppercase">{label}</span>
        </div>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border/50 pb-safe">
      <div className="flex justify-around items-center max-w-md mx-auto">
        <NavItem href="/" icon={Home} label="Drops" />
        <NavItem href="/search" icon={Search} label="Discover" />
        <NavItem href="/wishlist" icon={Heart} label="Wishlist" />
        <NavItem href="/settings" icon={User} label="Profile" />
      </div>
    </nav>
  );
}
