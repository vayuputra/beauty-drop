import type { Request, RequestHandler } from "express";
import { authStorage } from "./storage";

/**
 * What we keep in the session for a signed-in user. Both Google sign-in and
 * email/password sign-in store the same shape, so every route resolves the
 * current user the same way.
 */
export interface SessionUser {
  id: string;
}

/**
 * Returns the signed-in user's id, or undefined.
 *
 * Sessions created before this shape existed stored the raw OIDC claims
 * (`{ claims: { sub } }`), so those are still honoured until they expire.
 */
export function getUserId(req: Request): string | undefined {
  if (typeof req.isAuthenticated === "function" && !req.isAuthenticated()) return undefined;
  const user = req.user as { id?: unknown; claims?: { sub?: unknown } } | undefined;
  if (typeof user?.id === "string" && user.id) return user.id;
  if (typeof user?.claims?.sub === "string" && user.claims.sub) return user.claims.sub;
  return undefined;
}

/** Like getUserId, for handlers that sit behind `isAuthenticated`. */
export function requireUserId(req: Request): string {
  const id = getUserId(req);
  if (!id) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return id;
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!getUserId(req)) return res.status(401).json({ message: "Unauthorized" });
  next();
};

/** Parses ADMIN_EMAILS ("a@x.com, b@y.com") into a lowercase set. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined, admins = parseAdminEmails(process.env.ADMIN_EMAILS)): boolean {
  return !!email && admins.has(email.toLowerCase());
}

export async function isAdminUser(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await authStorage.getUser(userId);
  return isAdminEmail(user?.email);
}

/**
 * Restricts operator-only endpoints (bulk refreshes that spend AI credits,
 * analytics, cache control) to the emails listed in ADMIN_EMAILS.
 */
export const isAdmin: RequestHandler = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isAdminUser(userId))) return res.status(403).json({ message: "Forbidden" });
    next();
  } catch (err) {
    next(err);
  }
};
