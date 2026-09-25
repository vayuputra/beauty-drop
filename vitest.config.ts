import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    include: ["server/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database.
    fileParallelism: false,
  },
});
