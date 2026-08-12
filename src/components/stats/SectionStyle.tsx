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

// 风格配色：复用 tailwind 调色板
const STYLE_COLORS = [
  "#6366f1", // brand indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#f43f5e", // rose
  "#84cc16", // lime
  "#a855f7", // purple
  "#0ea5e9", // sky
  "#64748b", // slate (未分类兜底)
];

export function SectionStyle({ snapshot }: Props) {
  const data = snapshot.style;
  const total = data.reduce((sum, d) => sum + d.cnt, 0);

  // 给 chart 用：截断 label
  const chartData = data.map((d, i) => ({
    ...d,
    shortLabel: d.styleLabel.length > 8 ? d.styleLabel.slice(0, 8) + "…" : d.styleLabel,
    color: STYLE_COLORS[i % STYLE_COLORS.length],
  }));

  return (
    <section className="card p-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">🎨 文章风格分布</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            按 articles.style 字段聚合 · 共 {total} 篇
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="shortLabel"
                  stroke="#9ca3af"
                  fontSize={11}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.06)" }}
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
                      <span className="text-gray-700 truncate" title={d.styleLabel}>
                        {d.styleLabel}
                      </span>
                    </div>
                    <span className="text-gray-500 tabular-nums shrink-0 ml-2">
                      {d.cnt} 篇 · {pct}%
                    </span>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
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
