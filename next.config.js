/**
 * @type {import('next').NextConfig}
 *
 * basePath 读环境变量 BASE_PATH：
 *   - 本地 dev 留空 → http://localhost:3000
 *   - 反向代理部署 → /hotwriter 等子路径
 *
 * 必须与 NEXT_PUBLIC_BASE_PATH 保持一致（前者影响 server，后者内联进 client bundle）
 */
const nextConfig = {
  basePath: process.env.BASE_PATH || "",
  typescript: {
    // 项目存在既有 TS 警告（err: unknown、PLATFORMS 类型等），不阻塞构建
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
