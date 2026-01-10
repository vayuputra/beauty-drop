import { useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { Sparkles, ArrowRight } from "lucide-react";
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

  const handleLogin = () => {
    window.location.href = "/api/login";
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
          <button
            onClick={handleLogin}
            className="w-full group bg-foreground text-background py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3"
          >
            <span>Get Started</span>
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
          
          <p className="text-center text-xs text-muted-foreground mt-6">
            By continuing, you agree to our Terms of Service.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
