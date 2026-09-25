import { useUser, useUpdateUser } from "@/hooks/use-user";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { useLocation } from "wouter";
import { Database, Globe, MapPin, Monitor, Moon, Sun, Heart, LogOut, ChevronRight, BarChart3, GitCompareArrows, Newspaper, Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "next-themes";
import { clsx } from "clsx";

export default function Settings() {
  const { data: user, isLoading } = useUser();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();

  if (isLoading) return <div className="min-h-screen bg-background"><Loader /></div>;
  if (!user) return null;

  const MenuItem = ({ icon: Icon, label, value, onClick, destructive = false }: any) => (
    <button 
      onClick={onClick}
      className="w-full bg-card p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors first:rounded-t-2xl last:rounded-b-2xl border-b border-secondary last:border-0"
    >
      <div className="flex items-center gap-4">
        <div className={clsx(
          "w-10 h-10 rounded-full flex items-center justify-center",
          destructive ? "bg-destructive/10 text-destructive" : "bg-primary/20 text-foreground"
        )}>
          <Icon size={20} />
        </div>
        <span className={clsx("font-medium", destructive ? "text-destructive" : "text-foreground")}>
          {label}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {value && <span className="text-sm text-muted-foreground">{value}</span>}
        {!destructive && <ChevronRight size={18} className="text-muted-foreground/50" />}
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-secondary/30 pb-24">
      <header className="bg-background pt-12 pb-6 px-6 border-b border-border/50 sticky top-0 z-10">
        <div className="max-w-md mx-auto">
          <h1 className="font-display text-3xl font-bold mb-6">You</h1>
          
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-accent text-white flex items-center justify-center text-3xl font-bold shadow-lg shadow-accent/20 overflow-hidden">
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                (user.firstName?.charAt(0) || user.email?.charAt(0) || 'U').toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{user.firstName} {user.lastName}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-8 space-y-6">
        {/* Section 1 */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 ml-2">Preferences</h3>
          <div className="shadow-sm rounded-2xl overflow-hidden border border-border/50">
            <MenuItem 
              icon={Globe} 
              label="Region" 
              value={user.country === 'IN' ? 'India' : 'USA'} 
              onClick={() => setLocation("/onboarding")}
            />
            <MenuItem 
              icon={Heart} 
              label="Interests" 
              value={`${user.preferences?.interests?.length || 0} selected`}
              onClick={() => setLocation("/onboarding")}
            />
            <MenuItem
              icon={MapPin}
              label="Addresses"
              onClick={() => setLocation("/addresses")}
            />
          </div>
        </div>

        {/* Appearance */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 ml-2">Appearance</h3>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-secondary border border-border/50" role="radiogroup" aria-label="Theme">
            {([
              ["system", "Auto", Monitor],
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
            ] as const).map(([value, label, Icon]) => {
              const active = (theme ?? "system") === value;
              return (
                <button
                  key={value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(value)}
                  className={clsx(
                    "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={16} /> {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Features */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 ml-2">Features</h3>
          <div className="shadow-sm rounded-2xl overflow-hidden border border-border/50">
            <MenuItem
              icon={GitCompareArrows}
              label="Compare Products"
              onClick={() => setLocation("/compare")}
            />
            <MenuItem
              icon={Newspaper}
              label="Weekly Digest"
              onClick={() => setLocation("/digest")}
            />
            <MenuItem
              icon={Bell}
              label="Notifications"
              onClick={() => setLocation("/notifications")}
            />
            {user.isAdmin && (
              <MenuItem
                icon={BarChart3}
                label="Analytics Dashboard"
                onClick={() => setLocation("/analytics")}
              />
            )}
            {user.isAdmin && (
              <MenuItem
                icon={Database}
                label="Data & ingestion"
                onClick={() => setLocation("/admin")}
              />
            )}
          </div>
        </div>

        {/* Section 2 */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 ml-2">Account</h3>
          <div className="shadow-sm rounded-2xl overflow-hidden border border-border/50">
            <MenuItem 
              icon={LogOut} 
              label="Log Out" 
              destructive 
              onClick={() => logout()}
            />
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground pt-8">
          Version 1.0.0 • Made with 💖
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
