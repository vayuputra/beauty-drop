import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";

// Pages
import AuthPage from "@/pages/Auth";
import Home from "@/pages/Home";
import Onboarding from "@/pages/Onboarding";
import ProductDetails from "@/pages/ProductDetails";
import Settings from "@/pages/Settings";
import SearchPage from "@/pages/Search";
import WishlistPage from "@/pages/Wishlist";
import NotificationsPage from "@/pages/Notifications";
import ComparePage from "@/pages/Compare";
import AnalyticsPage from "@/pages/Analytics";
import DigestPage from "@/pages/Digest";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/" component={Home} />
      <Route path="/product/:id" component={ProductDetails} />
      <Route path="/search" component={SearchPage} />
      <Route path="/wishlist" component={WishlistPage} />
      <Route path="/settings" component={Settings} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/compare" component={ComparePage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/digest" component={DigestPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
