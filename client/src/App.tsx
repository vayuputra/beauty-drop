import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { ThemeProvider } from "next-themes";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader } from "@/components/Loader";
import { ThemeChrome } from "@/components/ThemeChrome";
import Home from "@/pages/Home";

// The feed loads eagerly; every other screen is split into its own chunk.
const AuthPage = lazy(() => import("@/pages/Auth"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const ProductDetails = lazy(() => import("@/pages/ProductDetails"));
const Settings = lazy(() => import("@/pages/Settings"));
const SearchPage = lazy(() => import("@/pages/Search"));
const BagPage = lazy(() => import("@/pages/Bag"));
const NotificationsPage = lazy(() => import("@/pages/Notifications"));
const ComparePage = lazy(() => import("@/pages/Compare"));
const AnalyticsPage = lazy(() => import("@/pages/Analytics"));
const DigestPage = lazy(() => import("@/pages/Digest"));
const AdminPage = lazy(() => import("@/pages/Admin"));
const AddressesPage = lazy(() => import("@/pages/Addresses"));
const NotFound = lazy(() => import("@/pages/not-found"));

/** Warm the product screen's code before the first tap on a product. */
export const preloadProductPage = () => import("@/pages/ProductDetails");

function Router() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><Loader /></div>}>
      <Switch>
        <Route path="/auth" component={AuthPage} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/" component={Home} />
        <Route path="/product/:id" component={ProductDetails} />
        <Route path="/search" component={SearchPage} />
        <Route path="/bag" component={BagPage} />
        <Route path="/wishlist"><Redirect to="/bag" /></Route>
        <Route path="/settings" component={Settings} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/compare" component={ComparePage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/digest" component={DigestPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/addresses" component={AddressesPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <ThemeChrome />
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
