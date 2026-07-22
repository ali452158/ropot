import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Externalize packages that don't bundle cleanly into the standalone server.
  // @prisma/client needs its generated engine binaries; undici uses native fetch dispatcher.
  serverExternalPackages: ["@prisma/client", "undici", "sharp"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
