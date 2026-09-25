import crypto from "crypto";

/** Constant-time check of a cron request's bearer token. Fails closed when no secret is configured. */
export function isValidCronRequest(authorization: string | undefined, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(authorization);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}
