import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startPriceCheckJob, stopPriceCheckJob } from "./services/priceChecker";
import rateLimit from "express-rate-limit";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === "production";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Rate limiting — general API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Stricter rate limit for expensive AI/refresh endpoints
const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded for this operation. Please try again later." },
});

app.use("/api/", apiLimiter);
app.use("/api/products/:id/refresh-influencers", expensiveLimiter);
app.use("/api/products/:id/refresh-image", expensiveLimiter);
app.use("/api/products/:id/refresh-prices", expensiveLimiter);
app.use("/api/products/:id/refresh-all", expensiveLimiter);
app.use("/api/refresh-trending", expensiveLimiter);
app.use("/api/refresh-images", expensiveLimiter);
app.use("/api/products/:id/calculate-trust-score", expensiveLimiter);
app.use("/api/products/:id/generate-review-summary", expensiveLimiter);
app.use("/api/products/:id/verify-image", expensiveLimiter);
app.use("/api/prices/fetch", expensiveLimiter);
app.use("/api/prices/refresh", expensiveLimiter);
app.use("/api/weekly-digest/generate", expensiveLimiter);

// Health check endpoint (before auth middleware so it's always accessible)
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request logging middleware — don't log response bodies in production
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (!isProduction) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (!isProduction && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Error handler — log the error instead of re-throwing (which would crash the process)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Error: ${status} - ${message}`, "error");
    if (!isProduction) {
      console.error(err);
    }

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      startPriceCheckJob();
    },
  );

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log(`${signal} received. Shutting down gracefully...`);
    stopPriceCheckJob();
    httpServer.close(() => {
      log("HTTP server closed.");
      pool.end().then(() => {
        log("Database pool closed.");
        process.exit(0);
      });
    });
    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      log("Forced shutdown after timeout.", "error");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
