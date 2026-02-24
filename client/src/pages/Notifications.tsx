import { useNotifications, useMarkNotificationsRead } from "@/hooks/use-drops";
import { BottomNav } from "@/components/BottomNav";
import { Loader } from "@/components/Loader";
import { ArrowLeft, Bell, TrendingDown, Target, Sparkles, Newspaper, CheckCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const typeConfig: Record<string, { icon: any; color: string; bgColor: string }> = {
  price_drop: { icon: TrendingDown, color: "text-green-600", bgColor: "bg-green-100" },
  target_reached: { icon: Target, color: "text-blue-600", bgColor: "bg-blue-100" },
  weekly_digest: { icon: Newspaper, color: "text-purple-600", bgColor: "bg-purple-100" },
  trending: { icon: Sparkles, color: "text-yellow-600", bgColor: "bg-yellow-100" },
};

export default function Notifications() {
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

  const handleMarkAllRead = () => {
    markRead.mutate(undefined);
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markRead.mutate([notification.id]);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md px-6 pt-12 pb-4 border-b border-border/40">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="font-display text-2xl font-bold">Notifications</h1>
                {unreadCount > 0 && (
                  <p className="text-xs text-accent font-medium">{unreadCount} unread</p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleMarkAllRead}
                disabled={markRead.isPending}
                className="gap-1 text-xs"
              >
                <CheckCheck size={14} />
                Mark all read
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-4">
        {isLoading ? (
          <Loader />
        ) : notifications && notifications.length > 0 ? (
          <div className="space-y-2">
            {notifications.map((notification: any, index: number) => {
              const config = typeConfig[notification.type] || typeConfig.trending;
              const Icon = config.icon;
              const productId = notification.data?.productId;

              const content = (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`rounded-xl border p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                    notification.isRead
                      ? "bg-card border-border"
                      : "bg-accent/5 border-accent/20"
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={`w-9 h-9 rounded-full ${config.bgColor} ${config.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${notification.isRead ? "" : "text-foreground"}`}>
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{formatTime(notification.createdAt)}</p>
                  </div>
                </motion.div>
              );

              return productId ? (
                <Link key={notification.id} href={`/product/${productId}`}>
                  {content}
                </Link>
              ) : (
                <div key={notification.id}>{content}</div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <Bell size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Notifications</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              You'll get notified about price drops, new trends, and weekly digests here.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
