import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright uses an isolated build directory so its test server never
  // contends with a developer's existing local garden process.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
