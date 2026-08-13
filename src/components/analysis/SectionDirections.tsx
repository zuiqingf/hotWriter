"use client";

/**
 * SectionDirections — 创作方向分布
 *
 * 左侧：BarChart 横条（方向 × 文章数）
 * 右侧：占比列表 + 进度条
 *
 * 配色复用 stats/SectionStyle 的 STYLE_COLORS。
 */

import type { AnalysisSnapshot } from "@/lib/analysis/queries";
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
  snapshot: AnalysisSnapshot;
}

const DIRECTION_COLORS = [
  "#A855F7",
  "#6E8CFF",
  "#EC4899",
  "#38BDF8",
  "#10B981",
  "#F59E0B",
  "#06B6D4",
  "#F43F5E",
  "#84CC16",
  "#64748B", // 兜底：未分类
];

export function SectionDirections({ snapshot }: Props) {
  const data = snapshot.directions;
  const total = data.reduce((s, d) => s + d.cnt, 0);

  const chartData = data.map((d, i) => ({
    ...d,
    shortLabel:
      d.direction.length > 8 ? d.direction.slice(0, 8) + "…" : d.direction,
    color: DIRECTION_COLORS[i % DIRECTION_COLORS.length],
  }));

  // 计算"是否过度集中"（top1 占比 > 50%）
  const top = data[0];
  const overConcentrated = top && total > 0 && top.pct > 50;

  return (
    <section className="stat-tile">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">🎯 创作方向分布</h3>
          <p className="text-xs text-white/50 mt-0.5">
            按调研方向聚合计数 · 共 {total} 篇
            {overConcentrated && (
              <span className="ml-2 text-amber-400">⚠️ 方向较集中（{top.pct}%）</span>
            )}
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-sm text-white/40">
          还没有方向数据
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* 左侧：横条 BarChart */}
          <div className="min-w-0">
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, Math.min(360, data.length * 36 + 40))}
            >
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  horizontal={false}
                />
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
                    item.payload.direction,
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
          <div className="space-y-2.5 overflow-y-auto max-h-[360px] min-h-[200px] scrollbar-hide">
            {chartData.map((d) => {
              return (
                <div key={d.direction} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: d.color }}
                      />
                      <span className="text-white/80 truncate" title={d.direction}>
                        {d.direction}
                      </span>
                    </div>
                    <span className="text-white/50 tabular-nums shrink-0 ml-2">
                      {d.cnt} 篇 · {d.pct}%
                    </span>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${d.pct}%`,
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