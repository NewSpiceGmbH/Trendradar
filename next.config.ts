import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // verrät nicht, dass die Seite mit Next.js läuft
  poweredByHeader: false,
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
