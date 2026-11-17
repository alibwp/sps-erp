import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop `next dev` from writing generated instruction files into the repo.
  agentRules: false,
  // `next dev` only serves its scripts to localhost unless other hosts are listed.
  allowedDevOrigins: ["127.0.0.1"],
  // Self-contained server in .next/standalone for the production Docker image.
  output: "standalone",
  // The app opens on the sign-in screen. A redirect here answers before any
  // page renders; redirect() inside app/page.tsx failed the dev prerender check.
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
