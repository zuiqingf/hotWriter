/**
 * 数据库重置脚本：DROP + CREATE DATABASE，然后触发 migrate 建表。
 * 危险：会清空 db_hotwriter 所有数据。
 *
 * 运行：npm run db:reset（package.json 用 tsx --env-file=.env 自动加载本地 .env）
 */

import mysql from "mysql2/promise";
import { dbReady, db } from "./index";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("[db:reset] DATABASE_URL 未设置（npm run db:reset 会自动读 .env）");
}

async function main() {
  const m = DATABASE_URL.match(/^(mysql:\/\/[^/]+)\/([^?]+)(\?.*)?$/);
  if (!m) throw new Error(`DATABASE_URL 格式非法: ${DATABASE_URL}`);
  const [, base, dbName] = m;

  console.warn(`⚠️  即将 DROP DATABASE \`${dbName}\`，3 秒后开始...`);
  await new Promise((r) => setTimeout(r, 3000));

  const conn = await mysql.createConnection({
    uri: `${base}/${m[3] || ""}`,
    charset: "utf8mb4",
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    console.log("✅ 已 DROP");
  } finally {
    await conn.end();
  }

  console.log("🔄 重新建库 + 建表...");
  await dbReady();
  await db.close();
  console.log("✅ 重置完成");
}

main().catch((err) => {
  console.error("❌ 重置失败:", err);
  process.exit(1);
});
