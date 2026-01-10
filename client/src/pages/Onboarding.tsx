import { useState, useEffect } from "react";
import { useUser, useUpdateUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { OnboardingLayout } from "@/components/OnboardingLayout";
import { Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { motion } from "framer-motion";

const COUNTRIES = [
  { id: "IN", label: "India", flag: "🇮🇳" },
  { id: "US", label: "USA", flag: "🇺🇸" },
];

const INTERESTS = [
  "Skincare", "Makeup", "Haircare", "Fragrance", "Tools", "Wellness"
];

const SKIN_TYPES = [
  "Oily", "Dry", "Combination", "Sensitive", "Normal"
];

const BUDGETS = [
  "Affordable ($)", "Mid-Range ($$)", "Luxury ($$$)"
];

export default function Onboarding() {
  const { data: user } = useUser();
  const updateUser = useUpdateUser();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    country: "",
    preferences: {
      interests: [] as string[],
      skinType: "",
      budget: "",
    }
  });

  // Redirect if already onboarded
  useEffect(() => {
    if (user?.country) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      finishOnboarding();
    }
  };

  const finishOnboarding = () => {
    updateUser.mutate({
      country: formData.country,
      preferences: formData.preferences,
    }, {
      onSuccess: () => {
        setLocation("/");
      }
    });
  };

  const toggleInterest = (interest: string) => {
    const current = formData.preferences.interests;
    const newInterests = current.includes(interest)
      ? current.filter(i => i !== interest)
      : [...current, interest];
    
    setFormData({
      ...formData,
      preferences: { ...formData.preferences, interests: newInterests }
    });
  };

  // --- STEP 1: COUNTRY ---
  if (step === 1) {
    return (
      <OnboardingLayout 
        step={1} 
        totalSteps={3} 
        title="Where are you shopping?" 
        subtitle="We'll show you products available in your region."
      >
        <div className="space-y-4">
          {COUNTRIES.map((country) => (
            <button
              key={country.id}
              onClick={() => setFormData({ ...formData, country: country.id })}
              className={clsx(
                "w-full p-6 rounded-2xl border-2 flex items-center justify-between transition-all duration-200",
                formData.country === country.id
                  ? "border-accent bg-accent/5 shadow-md"
                  : "border-border hover:border-accent/30 bg-white"
              )}
            >
              <span className="text-4xl">{country.flag}</span>
              <span className="text-xl font-medium">{country.label}</span>
              <div className={clsx(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                formData.country === country.id ? "border-accent bg-accent text-white" : "border-muted-foreground"
              )}>
                {formData.country === country.id && <Check size={14} />}
              </div>
            </button>
          ))}
        </div>
        
        <div className="fixed bottom-8 left-0 right-0 px-6 max-w-md mx-auto">
          <button
            onClick={handleNext}
            disabled={!formData.country}
            className="w-full bg-foreground text-background py-4 rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shadow-lg"
          >
            Next
          </button>
        </div>
      </OnboardingLayout>
    );
  }

  // --- STEP 2: INTERESTS ---
  if (step === 2) {
    return (
      <OnboardingLayout 
        step={2} 
        totalSteps={3} 
        title="What are you into?" 
        subtitle="Select at least one category to personalize your feed."
      >
        <div className="grid grid-cols-2 gap-3">
          {INTERESTS.map((interest) => {
            const isSelected = formData.preferences.interests.includes(interest);
            return (
              <button
                key={interest}
                onClick={() => toggleInterest(interest)}
                className={clsx(
                  "p-4 rounded-xl border-2 text-left font-medium transition-all duration-200",
                  isSelected
                    ? "border-accent bg-accent/10 text-accent-foreground"
                    : "border-border bg-white text-muted-foreground hover:border-accent/30"
                )}
              >
                {interest}
              </button>
            );
          })}
        </div>
        
        <div className="fixed bottom-8 left-0 right-0 px-6 max-w-md mx-auto">
          <button
            onClick={handleNext}
            disabled={formData.preferences.interests.length === 0}
            className="w-full bg-foreground text-background py-4 rounded-xl font-bold text-lg disabled:opacity-50 shadow-lg"
          >
            Next
          </button>
        </div>
      </OnboardingLayout>
    );
  }

  // --- STEP 3: DETAILS ---
  if (step === 3) {
    return (
      <OnboardingLayout 
        step={3} 
        totalSteps={3} 
        title="Final touches" 
        subtitle="Help us find the perfect match for you."
      >
        <div className="space-y-8">
          {/* Skin Type */}
          <div>
            <label className="block text-sm font-semibold text-foreground uppercase tracking-wider mb-3">
              Skin Type
            </label>
            <div className="flex flex-wrap gap-2">
              {SKIN_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => setFormData({ 
                    ...formData, 
                    preferences: { ...formData.preferences, skinType: type } 
                  })}
                  className={clsx(
                    "px-4 py-2 rounded-full text-sm border transition-colors",
                    formData.preferences.skinType === type
                      ? "bg-foreground text-background border-foreground"
                      : "bg-white text-foreground border-border hover:border-foreground"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="block text-sm font-semibold text-foreground uppercase tracking-wider mb-3">
              Budget Preference
            </label>
            <div className="flex flex-col gap-2">
              {BUDGETS.map(budget => (
                <button
                  key={budget}
                  onClick={() => setFormData({ 
                    ...formData, 
                    preferences: { ...formData.preferences, budget: budget } 
                  })}
                  className={clsx(
                    "w-full p-3 rounded-xl border text-left transition-colors",
                    formData.preferences.budget === budget
                      ? "border-accent bg-accent/5 text-accent-foreground font-medium"
                      : "border-border bg-white text-muted-foreground"
                  )}
                >
                  {budget}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="fixed bottom-8 left-0 right-0 px-6 max-w-md mx-auto">
          <button
            onClick={handleNext}
            disabled={!formData.preferences.skinType || !formData.preferences.budget || updateUser.isPending}
            className="w-full bg-accent text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 shadow-lg shadow-accent/25 flex items-center justify-center gap-2"
          >
            {updateUser.isPending && <Loader2 className="animate-spin" />}
            {updateUser.isPending ? "Setting up..." : "Finish Setup"}
          </button>
        </div>
      </OnboardingLayout>
    );
  }

  return null;
}
