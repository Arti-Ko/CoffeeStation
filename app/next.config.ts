import type { NextConfig } from "next";

/**
 * Static export for Tauri desktop bundling.
 *  - `pnpm dev` keeps live reloading + API routes work in the browser.
 *  - `pnpm build:static` produces ./out/ that Tauri loads as the renderer.
 *
 * In static mode, route handlers are skipped (we wire AI/sync/clip
 * through Tauri `invoke()` commands instead — see src-tauri/src/lib.rs).
 */
const isStatic = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  reactStrictMode: true,
  typedRoutes: false,
};

export default nextConfig;
