import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  experimental: {
    // Chapter generation can take a few minutes while DeepSeek reads images.
    proxyTimeout: 600000,
    // Allow multipart uploads of up to 8 photos through the rewrite proxy.
    proxyClientMaxBodySize: "40mb",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
