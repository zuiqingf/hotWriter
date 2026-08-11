/**
 * 数据库 schema（纯 SQL 定义 + 类型），MySQL 8.0+
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

// 数据库表创建 SQL（一次性建表，MySQL 8.0+）
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS articles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  uuid VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(512) NOT NULL,
  content MEDIUMTEXT,
  source_type VARCHAR(32),
  source_ref VARCHAR(255),
  direction_index INT,
  style VARCHAR(64),
  series_id INT,
  word_count INT DEFAULT 0,
  status VARCHAR(32) DEFAULT 'draft',
  tags TEXT,
  metadata TEXT,
  user_id INT DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_created_at ON articles(created_at);

CREATE TABLE IF NOT EXISTS article_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL,
  content MEDIUMTEXT NOT NULL,
  title VARCHAR(512),
  \`trigger\` VARCHAR(64),
  diff_summary TEXT,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  CONSTRAINT fk_av_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL,
  role VARCHAR(32) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  tokens_used INT,
  cost_cny VARCHAR(32),
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  CONSTRAINT fk_cm_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_chat_messages_article ON chat_messages(article_id, created_at);

CREATE TABLE IF NOT EXISTS research_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  keyword VARCHAR(255) NOT NULL,
  user_input TEXT,
  research_log LONGTEXT,
  directions TEXT,
  article_id INT,
  chosen_direction INT,
  total_cost_cny VARCHAR(32),
  tool_call_count INT DEFAULT 0,
  model VARCHAR(64),
  source_url TEXT,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  CONSTRAINT fk_rs_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hot_topics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(512) NOT NULL,
  source VARCHAR(32) NOT NULL,
  url TEXT,
  external_id VARCHAR(128),
  hot_score INT,
  category VARCHAR(64),
  summary TEXT,
  event_group_id VARCHAR(128),
  fetched_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  expired_at BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_hot_source_score ON hot_topics(source, hot_score);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action VARCHAR(64) NOT NULL,
  model VARCHAR(64),
  tokens_input INT,
  tokens_output INT,
  cost_cny VARCHAR(32),
  duration_ms INT,
  article_id INT,
  session_id INT,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_usage_created ON usage_logs(created_at);
`;
