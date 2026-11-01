// Base URL of the SPS ERP backend API, used by browser-side code.
// NEXT_PUBLIC_ values are baked in at build time (see .env.example).
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
