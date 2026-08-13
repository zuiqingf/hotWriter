/**
 * 统计页面 SQL 集中点
 *
 * 5 条 SQL 并发跑（Promise.all），结果组装成 StatsSnapshot 给 page.tsx。
 *
 * 重要约定：
 * - 所有 created_at 是秒级 BIGINT（UNIX_TIMESTAMP）
 * - cost_cny 是 VARCHAR(32)，SUM 必须 CAST(... AS DECIMAL(12,6))
 * - 所有 SUM/AVG 用 COALESCE 兜底 NULL → 0
 * - status='deleted' 是软删，过滤掉
 */

import { db } from "@/lib/db";
import { MONTHLY_BUDGET } from "@/lib/cost/tracker";
import { monthsAxis, type RangeConfig } from "./range";

export interface StatsSnapshot {
  range: RangeConfig;
  kpi: {
    total: number;
    drafts: number;
    archived: number;
    avgWords: number;
    lastCreatedAt: number | null;
  };
  cost: {
    monthCost: number;
    totalCost: number;
    logCount: number;
    budget: typeof MONTHLY_BUDGET;
    /** 0-1，>1 表示超预算 */
    pct: number;
  };
  /** 月度趋势：按 ym 升序，无数据的月份补 0 */
  trend: Array<{
    ym: string;
    articleCount: number;
    wordSum: number;
    costSum: number;
  }>;
  style: Array<{
    styleLabel: string;
    cnt: number;
    wordSum: number;
  }>;
  tokens: {
    totalIn: number;
    totalOut: number;
    totalCost: number;
    byAction: Array<{
      action: string;
      cnt: number;
      tokens: number;
      cost: number;
    }>;
  };
  /** 调研阶段工具调用统计（从 research_log JSON 聚合） */
  tavilyStats: {
    sessions: number;        // 调研会话数
    totalCalls: number;      // 总调用次数
    byTool: {
      web_search: number;    // Tavily
      search_zhihu: number;
      search_xiaohongshu: number;
      fetch_url: number;
      other: number;
    };
    /** 最近 N 个 Tavily 搜索关键词 */
    recentQueries: { query: string; ts: number }[];
  };
  hasAnyArticle: boolean;
  hasAnyLog: boolean;
}

/**
 * 一次性拉所有 section 需要的 SQL 结果
 */
export async function getStatsSnapshot(
  range: RangeConfig
): Promise<StatsSnapshot> {
  // 本月 1 号秒级时间戳（用于 cost.monthCost）
  const now = new Date();
  const startOfMonth = Math.floor(
    new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000
  );

  const [
    kpiRow,
    costRow,
    trendRows,
    styleRows,
    tokensTotalRow,
    tokensByActionRows,
    tavilySessionRows,
  ] = await Promise.all([
    // ① KPI
    db.get<{
      total: number;
      drafts: number;
      archived: number;
      avg_words: number;
      last_created_at: number | null;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'draft')    AS drafts,
         SUM(status = 'archived') AS archived,
         COALESCE(AVG(word_count), 0) AS avg_words,
         MAX(created_at) AS last_created_at
       FROM articles
       WHERE status != 'deleted' AND created_at >= ?`,
      [range.sinceTs]
    ),

    // ② 成本
    db.get<{
      month_cost: number | string;
      total_cost: number | string;
      log_count: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN created_at >= ? THEN CAST(cost_cny AS DECIMAL(12,6)) ELSE 0 END), 0) AS month_cost,
         COALESCE(SUM(CAST(cost_cny AS DECIMAL(12,6))), 0) AS total_cost,
         COUNT(*) AS log_count
       FROM usage_logs
       WHERE created_at >= ?`,
      [startOfMonth, range.sinceTs]
    ),

    // ③ 月度趋势（JOIN articles 拿字数）
    db.all<{
      ym: string;
      article_count: number;
      word_sum: number | string;
      cost_sum: number | string;
    }>(
      `SELECT
         DATE_FORMAT(FROM_UNIXTIME(ul.created_at), '%Y-%m') AS ym,
         COUNT(*) AS article_count,
         COALESCE(SUM(a.word_count), 0) AS word_sum,
         COALESCE(SUM(CAST(ul.cost_cny AS DECIMAL(12,6))), 0) AS cost_sum
       FROM usage_logs ul
       LEFT JOIN articles a ON a.id = ul.article_id
       WHERE ul.created_at >= ? AND ul.article_id IS NOT NULL
       GROUP BY ym
       ORDER BY ym ASC`,
      [range.sinceTs]
    ),

    // ④ 风格分布
    db.all<{
      style_label: string;
      cnt: number;
      word_sum: number;
    }>(
      `SELECT
         COALESCE(NULLIF(style, ''), '未分类') AS style_label,
         COUNT(*) AS cnt,
         COALESCE(SUM(word_count), 0) AS word_sum
       FROM articles
       WHERE status != 'deleted' AND created_at >= ?
       GROUP BY style_label
       ORDER BY cnt DESC
       LIMIT 12`,
      [range.sinceTs]
    ),

    // ⑤a Token 总数
    db.get<{
      total_in: number;
      total_out: number;
      total_cost: number | string;
    }>(
      `SELECT
         COALESCE(SUM(tokens_input),  0) AS total_in,
         COALESCE(SUM(tokens_output), 0) AS total_out,
         COALESCE(SUM(CAST(cost_cny AS DECIMAL(12,6))), 0) AS total_cost
       FROM usage_logs
       WHERE created_at >= ?`,
      [range.sinceTs]
    ),

    // ⑤b Token 按 action
    db.all<{
      action: string;
      cnt: number;
      tokens: number;
      cost: number | string;
    }>(
      `SELECT
         action,
         COUNT(*) AS cnt,
         COALESCE(SUM(tokens_input + tokens_output), 0) AS tokens,
         COALESCE(SUM(CAST(cost_cny AS DECIMAL(12,6))), 0) AS cost
       FROM usage_logs
       WHERE created_at >= ?
       GROUP BY action
       ORDER BY cost DESC`,
      [range.sinceTs]
    ),

    // ⑥ 调研工具调用（从 research_log JSON 聚合）
    db.all<{ research_log: string | null; created_at: number }>(
      `SELECT research_log, created_at
       FROM research_sessions
       WHERE created_at >= ? AND research_log IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 100`,
      [range.sinceTs]
    ),
  ]);

  // ============ 后处理 ============

  // KPI：mysql2 SUM 布尔可能返 0/1/null，统一兜底
  const total = Number(kpiRow?.total ?? 0);
  const drafts = Number(kpiRow?.drafts ?? 0);
  const archived = Number(kpiRow?.archived ?? 0);
  const avgWords = Math.round(Number(kpiRow?.avg_words ?? 0));
  const lastCreatedAt = kpiRow?.last_created_at
    ? Number(kpiRow.last_created_at)
    : null;

  // 成本：DECIMAL 返字符串，转 number
  const monthCost = Number(costRow?.month_cost ?? 0);
  const totalCost = Number(costRow?.total_cost ?? 0);
  const logCount = Number(costRow?.log_count ?? 0);
  const pct = MONTHLY_BUDGET > 0 ? monthCost / MONTHLY_BUDGET : 0;

  // 月度趋势：补 0 月份（按 monthsAxis 顺序）
  const axis = monthsAxis(range.months);
  const trendMap = new Map(
    trendRows.map((r) => [
      r.ym,
      {
        articleCount: Number(r.article_count),
        wordSum: Number(r.word_sum),
        costSum: Number(r.cost_sum),
      },
    ])
  );
  const trend = axis.map((ym) => ({
    ym,
    articleCount: trendMap.get(ym)?.articleCount ?? 0,
    wordSum: trendMap.get(ym)?.wordSum ?? 0,
    costSum: trendMap.get(ym)?.costSum ?? 0,
  }));

  // 风格
  const style = styleRows.map((r) => ({
    styleLabel: r.style_label,
    cnt: Number(r.cnt),
    wordSum: Number(r.word_sum),
  }));

  // Token
  const totalIn = Number(tokensTotalRow?.total_in ?? 0);
  const totalOut = Number(tokensTotalRow?.total_out ?? 0);
  const totalTokenCost = Number(tokensTotalRow?.total_cost ?? 0);
  const byAction = tokensByActionRows.map((r) => ({
    action: r.action,
    cnt: Number(r.cnt),
    tokens: Number(r.tokens),
    cost: Number(r.cost),
  }));

  // ============ Tavily / 调研工具统计 ============
  // research_log 是 [{type, tool, args, message, timestamp}, ...] 的 JSON 数组
  // 用它聚合 Tavily / 知乎 / 小红书 / fetch_url 调用次数
  type StepEntry = { type?: string; tool?: string; args?: { query?: string }; timestamp?: number };
  const byTool = {
    web_search: 0, // Tavily
    search_zhihu: 0,
    search_xiaohongshu: 0,
    fetch_url: 0,
    other: 0,
  };
  let totalCalls = 0;
  const recentQueries: { query: string; ts: number }[] = [];
  for (const row of tavilySessionRows) {
    if (!row.research_log) continue;
    let steps: StepEntry[] = [];
    try {
      steps = JSON.parse(row.research_log);
    } catch {
      continue;
    }
    if (!Array.isArray(steps)) continue;
    for (const s of steps) {
      if (s?.type !== "search") continue;
      totalCalls += 1;
      const tool = s.tool || "other";
      if (tool in byTool) {
        (byTool as any)[tool] += 1;
      } else {
        byTool.other += 1;
      }
      // 收集 Tavily 的 query（按时间倒序去重）
      if (tool === "web_search" && s.args?.query) {
        const ts = s.timestamp || row.created_at;
        if (!recentQueries.some((q) => q.query === s.args!.query)) {
          recentQueries.push({ query: s.args.query, ts });
        }
      }
    }
  }
  recentQueries.sort((a, b) => b.ts - a.ts);
  const tavilyStats = {
    sessions: tavilySessionRows.length,
    totalCalls,
    byTool,
    recentQueries: recentQueries.slice(0, 8),
  };

  return {
    range,
    kpi: { total, drafts, archived, avgWords, lastCreatedAt },
    cost: {
      monthCost,
      totalCost,
      logCount,
      budget: MONTHLY_BUDGET,
      pct,
    },
    trend,
    style,
    tokens: { totalIn, totalOut, totalCost: totalTokenCost, byAction },
    tavilyStats,
    hasAnyArticle: total > 0,
    hasAnyLog: logCount > 0,
  };
}
