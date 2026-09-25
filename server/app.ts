import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { catchAsyncErrors, NATIVE_APP_ORIGINS, sameOriginWrites, securityHeaders } from "./lib/http";

const isProduction = process.env.NODE_ENV === "production";

export function log(message: string, source = "express") {
  if (process.env.NODE_ENV === "test") return;
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

function limiter(max: number, message: string) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

// Endpoints that call paid AI/data APIs.
const EXPENSIVE_PATHS = [
  "/api/products/:id/refresh-influencers",
  "/api/products/:id/refresh-image",
  "/api/products/:id/refresh-prices",
  "/api/products/:id/refresh-all",
  "/api/refresh-trending",
  "/api/refresh-images",
  "/api/products/:id/calculate-trust-score",
  "/api/products/:id/generate-review-summary",
  "/api/products/:id/verify-image",
  "/api/prices/fetch",
  "/api/prices/refresh",
  "/api/weekly-digest/generate",
];

/**
 * Builds the Express app shared by the long-running server (server/index.ts)
 * and the Vercel function (server/vercel.ts). Static/Vite serving is added by
 * the caller after this resolves.
 */
export async function createApp(): Promise<{ app: Express; httpServer: Server }> {
  const app = express();
  const httpServer = createServer(app);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  catchAsyncErrors(app);

  app.use(securityHeaders);
  app.use(express.json({ limit: "100kb" }));

  const extraOrigins = [
    ...NATIVE_APP_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  ];
  app.use("/api/", sameOriginWrites(extraOrigins));

  // Rate limits are per instance (in memory). Move to a shared store (e.g. Redis) before scaling out.
  app.use("/api/", limiter(300, "Too many requests, please try again later."));
  app.use(["/api/auth/login", "/api/auth/register"], limiter(20, "Too many sign-in attempts. Please try again later."));
  app.use(EXPENSIVE_PATHS, limiter(10, "Rate limit exceeded for this operation. Please try again later."));
  // Writes only: preparing a cart calls the store; reading your Bag shouldn't count.
  app.use(
    "/api/checkout/jobs",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 40,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method === "GET",
      message: { error: "Too many checkout requests. Please try again in a few minutes." },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/api")) {
        log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
      }
    });
    next();
  });

  await registerRoutes(httpServer, app);

  // Unknown API paths get a JSON 404 instead of falling through to the SPA's index.html.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    // Don't leak internal error details (SQL, stack traces) to clients.
    const message = status < 500 ? err.message || "Bad request" : "Internal Server Error";
    log(`Error: ${status} - ${err.message}`, "error");
    if (!isProduction && status >= 500) console.error(err);
    res.status(status).json({ message });
  });

  return { app, httpServer };
}
