import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ['.next-phase3','.next-phase3-legacy'].includes(process.env.DOO_BUILD_DIR || '') ? process.env.DOO_BUILD_DIR : '.next',
  /* config options here */
  experimental: {
    agentFeedback: true,
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
