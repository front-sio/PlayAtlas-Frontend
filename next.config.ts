import type { NextConfig } from "next";

const normalizeBase = (value?: string) =>
  value
    ? value.trim().replace(/^https?:\/(?!\/)/, (match) => `${match}/`).replace(/\/+$/, "")
    : "";

const apiGatewayBase =
  normalizeBase(process.env.NEXT_PUBLIC_API_URL) ||
  normalizeBase(process.env.NEXT_PUBLIC_API_GATEWAY_URL) ||
  normalizeBase(process.env.NEXT_PUBLIC_ADMIN_WS_URL) ||
  "http://127.0.0.1:8081";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  // 禁用 Next.js 热重载，由 nodemon 处理重编译
  reactStrictMode: false,
  eslint: {
    // 构建时忽略ESLint错误
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/auth/:path*",
          destination: "/api/auth/:path*",
        },
        {
          source: "/api/:path*",
          destination: `${apiGatewayBase}/api/:path*`,
        },
        {
          source: "/socket.io/:path*",
          destination: `${apiGatewayBase}/socket.io/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
