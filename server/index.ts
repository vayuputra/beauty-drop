import { createApp, log } from "./app";
import { serveStatic } from "./static";
import { startPriceCheckJob, stopPriceCheckJob } from "./services/priceChecker";
import { pool } from "./db";

const isProduction = process.env.NODE_ENV === "production";

(async () => {
  const { app, httpServer } = await createApp();

  // Only set up Vite in development, after the API routes, so its catch-all
  // route doesn't shadow them.
  if (isProduction) {
    serveStatic(app);
  } else {
    // Local convenience: load demo products into an empty database.
    const { seedDatabase } = await import("./seed");
    await seedDatabase();
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
    startPriceCheckJob();
  });

  const shutdown = (signal: string) => {
    log(`${signal} received. Shutting down gracefully...`);
    stopPriceCheckJob();
    httpServer.close(() => {
      pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
