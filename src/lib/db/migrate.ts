/**
 * 数据库初始化脚本
 * v0.1 用 Node 22+ 内置 sqlite，无需 drizzle migrations
 */

import { db } from "./index";
import { CREATE_TABLES_SQL } from "./schema";

async function main() {
  console.log("🔄 初始化数据库...");
  db.raw.exec(CREATE_TABLES_SQL);
  console.log("✅ 数据库初始化完成");
  db.close();
}

main().catch((err) => {
  console.error("❌ 初始化失败:", err);
  process.exit(1);
});
