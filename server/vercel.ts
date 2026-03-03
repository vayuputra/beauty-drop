import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import rateLimit from "express-rate-limit";

const app = express();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.set("trust proxy", 1);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const expensiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      console.log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

// Initialize routes once (reused across warm invocations)
const httpServer = createServer(app);
let initialized = false;
const initPromise = registerRoutes(httpServer, app).then(() => {
  // Error handler (must be registered after routes)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`Error: ${status} - ${message}`);
    res.status(status).json({ message });
  });

  initialized = true;
});

export default async function handler(req: any, res: any) {
  if (!initialized) {
    await initPromise;
  }
  return app(req, res);
}
