import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Monorepo layout: repo root has an empty lockfile; keep Next rooted on frontend/.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  headers: async () => [
    {
      source: "/build-info.json",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
      ],
    },
  ],
  redirects: async () => [
    {
      source: "/dashboard",
      destination: "/",
      permanent: true,
    },
  ],
};

export default nextConfig;

