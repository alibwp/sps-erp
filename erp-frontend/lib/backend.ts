// Server-side only: the browser never needs the backend's address.

// The live backend, used by production builds when BACKEND_URL is not set.
export const LIVE_BACKEND_URL = "https://sps-erp-production.up.railway.app";

/**
 * Where this Next.js server sends the browser's /api calls: BACKEND_URL when
 * set (Docker Compose sets http://backend:5000), otherwise the live backend in
 * a production build and the local one in development.
 */
export function backendUrl(): string {
  const configured = process.env.BACKEND_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? LIVE_BACKEND_URL : "http://localhost:5000";
}
