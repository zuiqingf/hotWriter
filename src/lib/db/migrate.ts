/**
 * 数据库初始化脚本
 * 触发 ensureDatabaseAndSchema（建库 + 建表 + 轻量迁移），然后列出表验证。
 */

import { db, dbReady } from "./index";

async function main() {
  console.log("🔄 初始化 MySQL（建库 + 建表 + 迁移）...");
  await dbReady();
  const tables = await db.all<Record<string, string>>("SHOW TABLES");
  console.log(
    "✅ 表列表:",
    tables.map((t) => Object.values(t)[0])
  );
  await db.close();
}

main().catch((err) => {
  console.error("❌ 初始化失败:", err);
  process.exit(1);
});
