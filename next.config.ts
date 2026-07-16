import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in the home directory isn't
  // mistaken for the project root.
  turbopack: { root: __dirname },

  experimental: {
    // Both are barrel files exporting hundreds of icons, and neither is in
    // Next's default-optimized list. Without this, importing two token glyphs
    // pulls the whole index into the graph. Named imports only — a namespace
    // import (`import * as Icons`) defeats it.
    optimizePackageImports: ["@web3icons/react", "@phosphor-icons/react"],
  },
};

export default nextConfig;
