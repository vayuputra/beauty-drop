import type { Express, NextFunction, Request, RequestHandler, Response } from "express";

type AnyHandler = (req: Request, res: Response, next: NextFunction) => unknown;

/** Wraps a handler so a rejected promise reaches Express's error handler instead of crashing the process. */
export function wrapAsync(fn: AnyHandler): RequestHandler {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Express 4 does not catch errors from async handlers. This patches the app's
 * route methods so every handler registered afterwards is wrapped with wrapAsync.
 * Error handlers (4 args) and `app.get("setting")` lookups are left untouched.
 */
export function catchAsyncErrors(app: Express): void {
  for (const method of ROUTE_METHODS) {
    const original = (app as any)[method].bind(app);
    (app as any)[method] = (...args: unknown[]) => {
      if (method === "get" && args.length === 1) return original(...args);
      return original(
        ...args.map((arg) => (typeof arg === "function" && arg.length < 4 ? wrapAsync(arg as AnyHandler) : arg)),
      );
    };
  }
}

/** Origins of the Capacitor shells (Android uses https://localhost, iOS capacitor://localhost). */
export const NATIVE_APP_ORIGINS = ["https://localhost", "capacitor://localhost"];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isAllowedOrigin(origin: string, requestHost: string | undefined, extraOrigins: string[]): boolean {
  if (extraOrigins.includes(origin)) return true;
  try {
    return !!requestHost && new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

/**
 * CSRF defence in depth (alongside SameSite=Lax cookies): browsers always send
 * `Origin` on cross-site state-changing requests, so reject writes whose Origin
 * isn't this site or an allowed app origin.
 */
export function sameOriginWrites(extraOrigins: string[]): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin");
    if (!origin) return next(); // non-browser client (curl, server-to-server)
    const host = req.get("x-forwarded-host") ?? req.get("host");
    if (isAllowedOrigin(origin, host, extraOrigins)) return next();
    res.status(403).json({ message: "Cross-site request blocked" });
  };
}

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
};
