import { ReactNode } from "react";
import { motion } from "framer-motion";

interface OnboardingLayoutProps {
  children: ReactNode;
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
}

export function OnboardingLayout({ children, step, totalSteps, title, subtitle }: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col p-6 max-w-md mx-auto">
      {/* Progress Bar */}
      <div className="w-full h-1 bg-secondary rounded-full mt-4 mb-12">
        <motion.div 
          className="h-full bg-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(step / totalSteps) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col"
      >
        <h1 className="text-4xl font-display font-bold text-foreground mb-3">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
            {subtitle}
          </p>
        )}
        
        <div className="flex-1">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
