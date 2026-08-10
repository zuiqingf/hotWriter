/**
 * 数据库连接（Node 22 内置 node:sqlite）
 *
 * 不依赖 better-sqlite3 / drizzle-orm / 任何 native 模块
 * 用法:
 *   import { db } from "@/lib/db";
 *   const articles = await db.all("SELECT * FROM articles WHERE id = ?", [1]);
 */

import { DatabaseSync } from "node:sqlite";
import { CREATE_TABLES_SQL } from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH =
  process.env.DATABASE_URL?.replace("file:", "") ||
  path.join(process.cwd(), "data", "hotwriter.db");

// 确保 data 目录存在
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Singleton：避免开发热重载多连接
const globalForDb = globalThis as unknown as {
  _db?: DatabaseSync;
};

function getDb(): DatabaseSync {
  if (globalForDb._db) return globalForDb._db;
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(CREATE_TABLES_SQL);
  // 轻量级迁移：给已存在的库加新列（IF NOT EXISTS 在 SQLite 里没有，用 try/catch）
  try {
    db.exec("ALTER TABLE research_sessions ADD COLUMN source_url TEXT");
  } catch {
    // 列已存在，忽略
  }
  globalForDb._db = db;
  return db;
}

const sqlite = getDb();

// ============ 轻量级查询 API ============
export const db = {
  /** 执行 SELECT，返回所有结果 */
  all<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = sqlite.prepare(sql);
    return stmt.all(...params) as T[];
  },

  /** 执行 SELECT，返回第一行 */
  get<T = any>(sql: string, params: any[] = []): T | undefined {
    const stmt = sqlite.prepare(sql);
    return stmt.get(...params) as T | undefined;
  },

  /** 执行 INSERT/UPDATE/DELETE，返回 { changes, lastInsertRowid } */
  run(
    sql: string,
    params: any[] = []
  ): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = sqlite.prepare(sql);
    const r = stmt.run(...params);
    return {
      changes: Number(r.changes),
      lastInsertRowid: Number(r.lastInsertRowid),
    };
  },

  /** 关闭连接（开发热重载偶尔需要） */
  close() {
    sqlite.close();
    globalForDb._db = undefined;
  },

  /** 暴露底层（高级场景用，比如批量事务） */
  raw: sqlite,
};

// 重新导出 schema 和 utils
export * from "./schema";
export { generateUuid, countWords, formatTimeAgo, estimateTokens, truncate } from "../utils";
