import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.13.49"],
  // Traces only the files a production server actually needs into
  // .next/standalone — the Docker image copies just that instead of the
  // full node_modules tree. No effect on `next dev`.
  output: "standalone",
};

export default nextConfig;
