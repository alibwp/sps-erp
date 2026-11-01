// NEXT_PUBLIC_ values are baked in at build time (see .env.example).
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// A production build must point at the real backend. Falling back to
// localhost would make the live site call each visitor's own machine.
if (!apiUrl && process.env.NODE_ENV === "production") {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set for this production build. Set it to the " +
      "live backend URL (ending in /api) in erp-frontend/.env.production, or " +
      "pass --build-arg NEXT_PUBLIC_API_URL=https://... to docker build.",
  );
}

// Base URL of the SPS ERP backend API, used by browser-side code.
export const API_URL = apiUrl ?? "http://localhost:5000/api";
