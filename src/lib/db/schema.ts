/**
 * 数据库 schema（纯 SQL 定义 + 类型）
 *
 * 用 Node 22+ 内置的 node:sqlite，无需 better-sqlite3 / drizzle-orm
 */

export interface Article {
  id: number;
  uuid: string;
  title: string;
  content: string;
  source_type: string | null;
  source_ref: string | null;
  direction_index: number | null;
  style: string | null;
  series_id: number | null;
  word_count: number;
  status: string;
  tags: string | null;
  metadata: string | null;
  user_id: number;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: number;
  article_id: number;
  role: string;
  content: string;
  tokens_used: number | null;
  cost_cny: string | null;
  created_at: number;
}

export interface ResearchSession {
  id: number;
  keyword: string;
  user_input: string | null;
  research_log: string | null;
  directions: string | null;
  article_id: number | null;
  chosen_direction: number | null;
  total_cost_cny: string | null;
  tool_call_count: number;
  model: string | null;
  created_at: number;
}

export interface UsageLog {
  id: number;
  action: string;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_cny: string | null;
  duration_ms: number | null;
  article_id: number | null;
  session_id: number | null;
  created_at: number;
}

// 数据库表创建 SQL（一次性建表）
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  source_type TEXT,
  source_ref TEXT,
  direction_index INTEGER,
  style TEXT,
  series_id INTEGER,
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  tags TEXT,
  metadata TEXT,
  user_id INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);

CREATE TABLE IF NOT EXISTS article_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  title TEXT,
  trigger TEXT,
  diff_summary TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens_used INTEGER,
  cost_cny TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_article ON chat_messages(article_id, created_at);

CREATE TABLE IF NOT EXISTS research_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  user_input TEXT,
  research_log TEXT,
  directions TEXT,
  article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  chosen_direction INTEGER,
  total_cost_cny TEXT,
  tool_call_count INTEGER DEFAULT 0,
  model TEXT,
  source_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS hot_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  external_id TEXT,
  hot_score INTEGER,
  category TEXT,
  summary TEXT,
  event_group_id TEXT,
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expired_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hot_source_score ON hot_topics(source, hot_score);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_cny TEXT,
  duration_ms INTEGER,
  article_id INTEGER,
  session_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at);
`;
