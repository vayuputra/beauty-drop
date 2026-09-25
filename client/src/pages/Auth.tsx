import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { startGoogleLogin } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { api } from "@shared/routes";
import { useLocation } from "wouter";
import { Sparkles, ArrowRight, Mail } from "lucide-react";
import { motion } from "framer-motion";

export default function AuthPage() {
  const { data: user, isLoading } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      // If user exists but no country, go to onboarding. Else home.
      if (!user.country) {
        setLocation("/onboarding");
      } else {
        setLocation("/");
      }
    }
  }, [user, setLocation]);

  const queryClient = useQueryClient();
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [form, setForm] = useState({ email: "", password: "", firstName: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loginFailed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "login_failed";

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = mode === "register" ? form : { email: form.email, password: form.password };
      const res = await apiFetch(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || data.message || "Something went wrong. Please try again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: [api.user.get.path] });
    } catch {
      setError("Can't reach Beauty Drop right now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      {/* Abstract Background Shapes */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/40 blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-accent/10 blur-[80px]" />

      <div className="relative z-10 min-h-screen flex flex-col justify-between p-8 max-w-md mx-auto">
        
        {/* Header Section */}
        <div className="pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center mb-8 shadow-xl shadow-accent/20"
          >
            <Sparkles size={32} />
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-display text-5xl font-bold text-foreground mb-4 leading-tight"
          >
            Beauty <br />
            Drop.
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-muted-foreground leading-relaxed"
          >
            Discover trending beauty products from India and the US, curated just for you.
          </motion.p>
        </div>

        {/* Action Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="pb-12 space-y-4"
        >
          {loginFailed && !showEmail && (
            <p role="alert" className="text-sm text-destructive text-center">
              Google sign-in didn't complete. Please try again.
            </p>
          )}

          {showEmail ? (
            <form onSubmit={handleEmailSubmit} className="space-y-3" noValidate>
              {mode === "register" && (
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder="First name"
                  aria-label="First name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  required
                />
              )}
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="Email"
                aria-label="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-border bg-white px-4 py-3.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                required
              />
              <input
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
                aria-label="Password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-xl border border-border bg-white px-4 py-3.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                required
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-foreground text-background py-4 rounded-xl font-semibold text-lg shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {submitting ? "One moment…" : mode === "register" ? "Create account" : "Sign in"}
              </button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  onClick={() => { setMode(mode === "register" ? "signin" : "register"); setError(null); }}
                  className="text-accent font-medium py-2"
                >
                  {mode === "register" ? "I already have an account" : "Create an account"}
                </button>
                <button type="button" onClick={() => setShowEmail(false)} className="text-muted-foreground py-2">
                  Back
                </button>
              </div>
            </form>
          ) : (
          <>
          <button
            onClick={startGoogleLogin}
            className="w-full group bg-foreground text-background py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3"
          >
            <span>Continue with Google</span>
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={() => setShowEmail(true)}
            className="w-full py-4 rounded-xl font-medium text-foreground border border-border bg-white/70 backdrop-blur-sm hover:bg-white transition-colors flex items-center justify-center gap-2"
          >
            <Mail size={18} />
            <span>Continue with email</span>
          </button>
          </>
          )}
          
          <p className="text-center text-xs text-muted-foreground mt-6">
            By continuing, you agree to our Terms of Service.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
