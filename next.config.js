/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 是 native 模块，确保 server 端能跑（不打包）
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = ['better-sqlite3'];
    }
    return config;
  },
};

module.exports = nextConfig;
