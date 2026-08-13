/**
 * 用户创作分析 — SQL 聚合
 *
 * /analysis 页用到的所有 SQL 都集中在这里。
 * 数据模型：
 *   - articles：每篇文章（含 direction_index）
 *   - research_sessions：调研（directions JSON + chosen_direction）
 *   - article_analyses：分析结果历史
 *
 * 注意：
 *   - cost_cny 是 VARCHAR，所有聚合都 CAST(... AS DECIMAL(12,6)) + COALESCE(..., 0)
 *   - created_at 是秒级 BIGINT，sinceTs 也是秒
 */

import { db } from "@/lib/db";

export interface HourlyBucket { hour: number; cnt: number; }
export interface DailyBucket { dow: number; cnt: number; } // 1=周日 ... 7=周六
export interface HabitsSummary {
  activeDays: number;       // 写作天数
  totalArticles: number;    // 总文章数
  avgWords: number;         // 平均字数
  hourly: HourlyBucket[];   // 0-23 时分布
  daily: DailyBucket[];      // 周一到周日
}

export interface RecentArticle {
  id: number;
  title: string;
  style: string | null;
  wordCount: number;
  createdAt: number;
  directionTitle: string;   // 从 research_sessions.directions[direction_index-1].title 取
  keyword: string;
  analysisId: number | null;
  analyzedAt: number | null;
}

export interface AnalysisSnapshot {
  range: { key: "7d" | "30d" | "all"; label: string; sinceTs: number };
  hasAnyArticle: boolean;
  habits: HabitsSummary;
  recentArticles: RecentArticle[];
}

/* ============ 创作习惯（时段 + 工作日 + 频率） ============ */

export async function getHabits(sinceTs: number): Promise<HabitsSummary> {
  const [hourly, daily, summary] = await Promise.all([
    db.all<HourlyBucket>(
      `SELECT HOUR(FROM_UNIXTIME(created_at)) AS hour, COUNT(*) AS cnt
       FROM articles
       WHERE status != 'deleted' AND created_at >= ?
       GROUP BY hour`,
      [sinceTs]
    ),
    db.all<DailyBucket>(
      `SELECT DAYOFWEEK(FROM_UNIXTIME(created_at)) AS dow, COUNT(*) AS cnt
       FROM articles
       WHERE status != 'deleted' AND created_at >= ?
       GROUP BY dow`,
      [sinceTs]
    ),
    db.get<{ active_days: number; total: number; avg_words: number | null }>(
      `SELECT
         COUNT(DISTINCT DATE(FROM_UNIXTIME(created_at))) AS active_days,
         COUNT(*) AS total,
         AVG(word_count) AS avg_words
       FROM articles
       WHERE status != 'deleted' AND created_at >= ?`,
      [sinceTs]
    ),
  ]);

  return {
    activeDays: Number(summary?.active_days || 0),
    totalArticles: Number(summary?.total || 0),
    avgWords: Math.round(Number(summary?.avg_words || 0)),
    hourly,
    daily,
  };
}

/* ============ 最近 N 篇 + 每篇 latestAnalysis ============ */

export async function getRecentArticles(
  sinceTs: number,
  limit = 20
): Promise<RecentArticle[]> {
  type Row = {
    id: number;
    title: string;
    style: string | null;
    word_count: number;
    created_at: number;
    direction_index: number | null;
    keyword: string | null;
    directions: string | null;
    analysis_id: number | null;
    analyzed_at: number | null;
  };
  const rows = await db.all<Row>(
    `SELECT
       a.id, a.title, a.style, a.word_count, a.created_at,
       a.direction_index, rs.keyword, rs.directions,
       latest.id AS analysis_id, latest.created_at AS analyzed_at
     FROM articles a
     LEFT JOIN research_sessions rs ON rs.article_id = a.id
     LEFT JOIN (
       SELECT article_id, MAX(created_at) AS max_at
       FROM article_analyses GROUP BY article_id
     ) la ON la.article_id = a.id
     LEFT JOIN article_analyses latest
       ON latest.article_id = la.article_id AND latest.created_at = la.max_at
     WHERE a.status != 'deleted' AND a.created_at >= ?
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [sinceTs, limit]
  );

  return rows.map((r) => {
    let dirTitle = "未分类";
    if (r.directions) {
      try {
        const dirs = JSON.parse(r.directions) as any[];
        const wantIdx = (r.direction_index ?? 1) - 1;
        const picked = wantIdx >= 0 && wantIdx < dirs.length ? dirs[wantIdx] : dirs[0];
        if (picked?.title) dirTitle = String(picked.title);
      } catch {
        /* keep */
      }
    }
    return {
      id: r.id,
      title: r.title || "（无标题）",
      style: r.style,
      wordCount: Number(r.word_count || 0),
      createdAt: Number(r.created_at),
      directionTitle: dirTitle,
      keyword: r.keyword || "",
      analysisId: r.analysis_id ?? null,
      analyzedAt: r.analyzed_at ?? null,
    };
  });
}

/* ============ 单篇最新分析 payload（用于"查看分析" 按钮） ============ */

export async function getLatestAnalysisPayload(articleId: number): Promise<{
  id: number;
  payload: any;
  hotRefs: any[];
  createdAt: number;
  costCny: number;
  durationMs: number;
  model: string | null;
} | null> {
  const row = await db.get<{
    id: number;
    payload: string;
    hot_refs: string | null;
    cost_cny: string | null;
    duration_ms: number | null;
    model: string | null;
    created_at: number;
  }>(
    `SELECT id, payload, hot_refs, cost_cny, duration_ms, model, created_at
     FROM article_analyses
     WHERE article_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [articleId]
  );
  if (!row) return null;
  let parsedPayload: any = null;
  let hotRefs: any[] = [];
  try {
    parsedPayload = JSON.parse(row.payload);
  } catch {
    parsedPayload = null;
  }
  try {
    hotRefs = row.hot_refs ? JSON.parse(row.hot_refs) : [];
  } catch {
    hotRefs = [];
  }
  return {
    id: row.id,
    payload: parsedPayload,
    hotRefs,
    createdAt: row.created_at,
    costCny: parseFloat(row.cost_cny || "0"),
    durationMs: row.duration_ms || 0,
    model: row.model,
  };
}

/* ============ 入口：并发拿所有数据 ============ */

export async function getAnalysisSnapshot(range: {
  key: "7d" | "30d" | "all";
  label: string;
  sinceTs: number;
}): Promise<AnalysisSnapshot> {
  const [habits, recentArticles] = await Promise.all([
    getHabits(range.sinceTs),
    getRecentArticles(range.sinceTs, 20),
  ]);

  return {
    range,
    hasAnyArticle: recentArticles.length > 0,
    habits,
    recentArticles,
  };
}