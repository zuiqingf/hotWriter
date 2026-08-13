"use client";

/**
 * SectionTavily — 调研阶段工具调用统计
 *
 * 数据源：research_sessions.research_log（JSON 数组）
 *   每条 step 形如 { type: "search", tool: "web_search"|"search_zhihu"|..., args: { query } }
 *
 * 展示：
 *   - 顶部 3 张 KPI：调研会话数 / 总调用次数 / Tavily 占比
 *   - 中间 Pie：4 类工具占比（Tavily / 知乎 / 小红书 / fetch_url）
 *   - 底部最近 N 条 Tavily 搜索关键词
 */

import type { StatsSnapshot } from "@/lib/stats/queries";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatTimeAgo } from "@/lib/utils";

interface Props {
  snapshot: StatsSnapshot;
}

const TOOL_META: Record<string, { label: string; emoji: string; color: string }> = {
  web_search: { label: "Tavily", emoji: "🌐", color: "#A855F7" },        // 紫，主搜索
  search_zhihu: { label: "知乎", emoji: "📘", color: "#6E8CFF" },         // 蓝
  search_xiaohongshu: { label: "小红书", emoji: "📕", color: "#EC4899" }, // 粉
  search_baidu: { label: "百度", emoji: "🅱️", color: "#3385FF" },          // 百度蓝
  search_toutiao: { label: "头条", emoji: "📰", color: "#FF6B35" },        // 头条橙
  search_wechat: { label: "微信", emoji: "💬", color: "#07C160" },        // 微信绿
  fetch_url: { label: "抓页面", emoji: "📖", color: "#10B981" },          // 绿
  other: { label: "其他", emoji: "🔧", color: "#64748B" },                // 灰
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "rgba(10,10,15,0.92)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
  },
  labelStyle: { color: "rgba(255,255,255,0.6)" },
  itemStyle: { color: "#fff" },
} as const;

export function SectionTavily({ snapshot }: Props) {
  const { tavilyStats } = snapshot;
  const { sessions, totalCalls, byTool, recentQueries } = tavilyStats;

  // 完全没调研过 → 不显示整个 section（与 SectionTokens 空态一致）
  if (sessions === 0 || totalCalls === 0) {
    return null;
  }

  const tavilyCount = byTool.web_search;
  const tavilyPct = totalCalls > 0 ? Math.round((tavilyCount / totalCalls) * 100) : 0;

  const pieData = Object.entries(byTool)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      name: TOOL_META[k]?.label || k,
      value: v,
      color: TOOL_META[k]?.color || "#64748B",
    }));

  return (
    <section className="stat-tile">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">🔍 调研工具调用</h3>
          <p className="text-xs text-white/50 mt-0.5">
            {sessions} 次调研 · {totalCalls} 次工具调用 · Tavily 占比 {tavilyPct}%
          </p>
        </div>
      </div>

      {/* KPI 三件套 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-xs text-white/50">调研会话</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">
            {sessions}
          </div>
        </div>
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-xs text-white/50">总工具调用</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">
            {totalCalls}
          </div>
        </div>
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.18)",
          }}
        >
          <div className="text-xs text-white/50">Tavily 调用</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: "#C084FC" }}>
            {tavilyCount}
            <span className="text-sm text-white/40 ml-1.5 font-normal">
              ({tavilyPct}%)
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：工具占比饼图 */}
        <div className="min-w-0">
          <div className="stat-label mb-2">工具分布</div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="rgba(10,10,15,0.8)"
                  strokeWidth={2}
                >
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, _: any, item: any) => [
                    `${value} 次`,
                    item.payload.name,
                  ]}
                  {...TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5 min-w-0">
              {Object.entries(byTool).map(([k, v]) => {
                if (v === 0) return null;
                const meta = TOOL_META[k] || TOOL_META.other;
                const pct = Math.round((v / totalCalls) * 100);
                return (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: meta.color }}
                    />
                    <span className="text-white/80 shrink-0">
                      {meta.emoji} {meta.label}
                    </span>
                    <span className="text-white/40 tabular-nums shrink-0">
                      {v} 次 · {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧：最近 Tavily 搜索关键词 */}
        <div className="min-w-0">
          <div className="stat-label mb-2">最近 Tavily 搜索词</div>
          {recentQueries.length === 0 ? (
            <div className="text-xs text-white/40 py-4">暂无 Tavily 调用</div>
          ) : (
            <ul className="space-y-1.5 overflow-y-auto max-h-[200px] scrollbar-hide">
              {recentQueries.map((q, i) => (
                <li
                  key={`${q.query}-${i}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <span
                    className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5"
                    style={{
                      background: "rgba(168,85,247,0.20)",
                      color: "#C084FC",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-white/80 truncate" title={q.query}>
                      {q.query}
                    </div>
                    <div className="text-white/30 text-[10px] mt-0.5">
                      {formatTimeAgo(q.ts)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}