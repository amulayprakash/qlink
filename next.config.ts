import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in the home directory isn't
  // mistaken for the project root.
  turbopack: { root: __dirname },
};

export default nextConfig;
