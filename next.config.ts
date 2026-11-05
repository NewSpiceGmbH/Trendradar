import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // verrät nicht, dass die Seite mit Next.js läuft
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Deep Dive: Transkripte (Notion-Export als Text, Markdown oder PDF) per Server Action; Vercel erlaubt bis 4,5 MB
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
