import { Capacitor } from "@capacitor/core";

/**
 * Base URL for API calls. On the web the API is same-origin, so paths stay
 * relative. Inside the native (Capacitor) shell the bundled app is served from
 * localhost, so API calls need the deployed backend's origin, set at build time
 * via VITE_API_BASE_URL.
 */
function apiBase(): string {
  if (Capacitor.isNativePlatform()) {
    return (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  }
  return "";
}

/** Absolute-or-relative URL for an API path, usable in fetch, <img src> and window.open. */
export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}

/** fetch() for our API: resolves the base URL and always sends the session cookie. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { credentials: "include", ...init });
}
