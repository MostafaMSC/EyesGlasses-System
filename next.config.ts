import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.13.49"],
  // Traces only the files a production server actually needs into
  // .next/standalone — the Docker image copies just that instead of the
  // full node_modules tree. No effect on `next dev`.
  output: "standalone",
  async headers() {
    return [
      {
        // A served 3D model, addressed with the `?v=<mtime>` the catalogue
        // API adds. Next's default for `public/` is `max-age=0`, which
        // makes every try-on session re-ask the server about a file that
        // hasn't changed. With the version in the URL a replaced file gets a
        // new URL, so the old one can be kept for good. Only the versioned
        // form: a bare path is still revalidated, so the admin panel's
        // model check and thumbnail always see the current file.
        source: "/assets/frames/:path*",
        has: [{ type: "query", key: "v" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
