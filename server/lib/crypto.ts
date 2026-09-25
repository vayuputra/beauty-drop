import crypto from "crypto";

const VERSION = "v1";
let cachedKey: Buffer | null = null;

/**
 * 32-byte key for encrypting personal data at rest, from ADDRESS_ENCRYPTION_KEY
 * (base64). Production requires it; development derives a stable key from
 * SESSION_SECRET (or a fixed dev string) so local data stays readable.
 */
export function getDataKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ADDRESS_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("ADDRESS_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    cachedKey = key;
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADDRESS_ENCRYPTION_KEY must be set in production (generate with: openssl rand -base64 32)");
  }
  cachedKey = crypto.scryptSync(process.env.SESSION_SECRET || "beauty-drop-dev-only", "beauty-drop-address-key", 32);
  return cachedKey;
}

export function isDataKeyConfigured(): boolean {
  try {
    getDataKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypts a JSON-serialisable value. Output: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encryptJson(value: unknown, key = getDataKey()): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptJson<T>(payload: string, key = getDataKey()): T {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
