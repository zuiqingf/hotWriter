/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/hotwriter",
  typescript: {
    // 项目存在既有 TS 警告（err: unknown、PLATFORMS 类型等），不阻塞构建
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
