/**
 * 数据库连接（MySQL 8.0+ / mysql2 连接池）
 *
 * 用法:
 *   import { db } from "@/lib/db";
 *   const articles = await db.all("SELECT * FROM articles WHERE id = ?", [1]);
 *
 * 约定:
 *   - DATABASE_URL 形如 mysql://user:pass@host:3306/dbname?charset=utf8mb4
 *   - 密码中的特殊字符（如 #）必须 URL-encode（# → %23）
 *   - 库不存在时自动 CREATE DATABASE；表不存在时自动 CREATE TABLE
 *   - dev 热重载复用 globalThis._pool，避免连接泄漏
 */

import mysql from "mysql2/promise";
import { CREATE_TABLES_SQL } from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "[db] DATABASE_URL 未设置。本地开发请确认 .env 文件存在（参考 .env.example）；"
  );
}

const globalForDb = globalThis as unknown as { _pool?: mysql.Pool };

let initPromise: Promise<void> | null = null;

function splitStatements(sql: string): string[] {
  // 按 ";\n" 切，过滤空串与纯注释行
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

/** 从 mysql://...:port/db?... 中抽出 { 无库 URL, 库名 } */
function parseDbName(url: string): { urlWithoutDb: string; dbName: string } {
  const m = url.match(/^(mysql:\/\/[^/]+)\/([^?]+)(\?.*)?$/);
  if (!m) throw new Error(`[db] DATABASE_URL 格式非法: ${url}`);
  const base = m[1] + "/" + (m[3] || "");
  return { urlWithoutDb: base, dbName: m[2] };
}

async function ensureDatabaseAndSchema(): Promise<void> {
  const { urlWithoutDb, dbName } = parseDbName(DATABASE_URL);

  // 1) 用「不指定库」的连接 CREATE DATABASE
  const bootstrap = await mysql.createConnection({
    uri: urlWithoutDb,
    charset: "utf8mb4",
  });
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrap.end();
  }

  // 2) 在 pool 上逐条执行 schema
  // CREATE INDEX IF NOT EXISTS 在某些 MySQL 分支（含本机阿里云）不支持，故：
  // - CREATE TABLE 用 IF NOT EXISTS（普遍支持）
  // - CREATE INDEX 改为裸语句 + try/catch 忽略 ER_DUP_KEYNAME(1061)
  const pool = getPool();
  for (const stmt of splitStatements(CREATE_TABLES_SQL)) {
    try {
      await pool.query(stmt);
    } catch (err: any) {
      if (err.errno === 1061 || err.code === "ER_DUP_KEYNAME") continue;
      throw err;
    }
  }
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    uri: DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "+08:00",
    multipleStatements: false,
  });
}

export function getPool(): mysql.Pool {
  if (!globalForDb._pool) {
    globalForDb._pool = createPool();
    initPromise = ensureDatabaseAndSchema().catch((e) => {
      console.error("[db] 初始化失败:", e);
      throw e;
    });
  }
  return globalForDb._pool;
}

/** 等待 schema 初始化完成；db.all/get/run 前调用 */
export function dbReady(): Promise<void> {
  // 触发 pool 创建（如果还没创建）
  getPool();
  return initPromise ?? Promise.resolve();
}

// ============ 轻量级查询 API ============
export const db = {
  /** 执行 SELECT，返回所有结果 */
  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await dbReady();
    const [rows] = await getPool().query(sql, params);
    return rows as T[];
  },

  /** 执行 SELECT，返回第一行 */
  async get<T = any>(
    sql: string,
    params: any[] = []
  ): Promise<T | undefined> {
    await dbReady();
    const [rows] = await getPool().query(sql, params);
    return (rows as T[])[0];
  },

  /** 执行 INSERT/UPDATE/DELETE，返回 { changes, lastInsertRowid }（兼容旧 SQLite 调用方） */
  async run(
    sql: string,
    params: any[] = []
  ): Promise<{ changes: number; lastInsertRowid: number }> {
    await dbReady();
    const [r] = await getPool().query(sql, params);
    const h = r as mysql.ResultSetHeader;
    return {
      changes: Number(h.affectedRows) || 0,
      lastInsertRowid: Number(h.insertId) || 0,
    };
  },

  /** 关闭连接池 */
  async close(): Promise<void> {
    if (globalForDb._pool) {
      await globalForDb._pool.end();
      globalForDb._pool = undefined;
      initPromise = null;
    }
  },
};

// 重新导出 schema 和 utils
export * from "./schema";
export { generateUuid, countWords, formatTimeAgo, estimateTokens, truncate } from "../utils";
