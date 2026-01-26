import type { NextConfig } from "next";

const apiGatewayBase =
  process.env.NEXT_PUBLIC_ADMIN_WS_URL?.trim().replace(/\/+$/, "") ||
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
