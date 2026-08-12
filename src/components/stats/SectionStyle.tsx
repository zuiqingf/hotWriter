"use client";

/**
 * SectionStyle — 文章风格分布
 *
 * 左侧 Recharts BarChart（layout="vertical" 横条）
 * 右侧占比列表 + 进度条
 */

import type { StatsSnapshot } from "@/lib/stats/queries";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Props {
  snapshot: StatsSnapshot;
}

// 风格配色：暗底友好版
const STYLE_COLORS = [
  "#A855F7", // purple
  "#6E8CFF", // indigo blue
  "#EC4899", // pink
  "#38BDF8", // sky
  "#10B981", // emerald
  "#F59E0B", // amber
  "#06B6D4", // cyan
  "#F43F5E", // rose
  "#84CC16", // lime
  "#8B5CF6", // violet
  "#0EA5E9", // sky2
  "#64748B", // slate (未分类兜底)
];

export function SectionStyle({ snapshot }: Props) {
  const data = snapshot.style;
  const total = data.reduce((sum, d) => sum + d.cnt, 0);

  const chartData = data.map((d, i) => ({
    ...d,
    shortLabel: d.styleLabel.length > 8 ? d.styleLabel.slice(0, 8) + "…" : d.styleLabel,
    color: STYLE_COLORS[i % STYLE_COLORS.length],
  }));

  return (
    <section className="stat-tile">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">🎨 文章风格分布</h3>
          <p className="text-xs text-white/50 mt-0.5">
            按 articles.style 字段聚合 · 共 {total} 篇
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-sm text-white/40">
          还没有任何风格数据
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* 左侧：横条 BarChart */}
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={Math.max(200, Math.min(360, data.length * 36 + 40))}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="shortLabel"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: "rgba(168,85,247,0.10)" }}
                  contentStyle={{
                    background: "rgba(10,10,15,0.92)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value: any, _: any, item: any) => [
                    `${value} 篇 · ${item.payload.wordSum.toLocaleString()} 字`,
                    item.payload.styleLabel,
                  ]}
                />
                <Bar dataKey="cnt" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 右侧：占比列表 */}
          <div className="space-y-2.5 overflow-y-auto max-h-[360px] min-h-[200px]">
            {chartData.map((d) => {
              const pct = total > 0 ? Math.round((d.cnt / total) * 100) : 0;
              return (
                <div key={d.styleLabel} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: d.color }}
                      />
                      <span className="text-white/80 truncate" title={d.styleLabel}>
                        {d.styleLabel}
                      </span>
                    </div>
                    <span className="text-white/50 tabular-nums shrink-0 ml-2">
                      {d.cnt} 篇 · {pct}%
                    </span>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: d.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}