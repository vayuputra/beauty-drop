import { motion } from "framer-motion";

export function Loader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] w-full">
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="w-16 h-16 rounded-full bg-primary/30 flex items-center justify-center backdrop-blur-sm"
      >
        <div className="w-8 h-8 rounded-full bg-accent" />
      </motion.div>
      <p className="mt-4 text-sm font-medium text-muted-foreground tracking-widest uppercase">
        Loading Beauty...
      </p>
    </div>
  );
}
