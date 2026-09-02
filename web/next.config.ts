import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build: `.next/standalone/` carries its own minimal server.js +
  // traced node_modules, so the daemon can ship and run it without `next`/`react`
  // in its own dependency tree. Staged into `dist/web/` by the root build.
  output: "standalone",

  // Trace from the repo root: nft then copies the *real* files out of the hoisted
  // pnpm store (`node_modules/.pnpm/...`) instead of dangling symlinks. Cost: the
  // standalone entry lands at `.next/standalone/web/server.js` (staged by the
  // root build into `dist/web/`).
  outputFileTracingRoot: path.join(__dirname, ".."),

  // Node-only modules the server code loads at runtime — keep them external
  // (require'd from the traced node_modules) instead of bundled.
  serverExternalPackages: ["ws"],
};

export default nextConfig;
