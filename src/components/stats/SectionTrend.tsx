"use client";

/**
 * SectionTrend — 月度趋势
 *
 * 左侧 Recharts LineChart：双轴（cost_cny 左、文章数右）
 * 右侧月度明细表：ym / 篇数 / 字数 / 花费
 */

import type { StatsSnapshot } from "@/lib/stats/queries";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Props {
  snapshot: StatsSnapshot;
}

export function SectionTrend({ snapshot }: Props) {
  const data = snapshot.trend.map((r) => ({
    ym: r.ym,
    cost: Number(r.costSum.toFixed(4)),
    articles: r.articleCount,
    words: r.wordSum,
  }));

  // ym 太长，截短成 "M月"
  const shortYmd = (ym: string) => {
    const [y, m] = ym.split("-");
    return `${parseInt(m, 10)}月`;
  };

  return (
    <section className="card p-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">📈 月度趋势</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            按文章关联的 usage_logs 聚合
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* 左侧：曲线图 */}
        <div className="lg:col-span-2 min-w-0">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="ym"
                tickFormatter={shortYmd}
                stroke="#9ca3af"
                fontSize={11}
              />
              <YAxis
                yAxisId="left"
                stroke="#6366f1"
                fontSize={11}
                tickFormatter={(v) => `¥${v}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#10b981"
                fontSize={11}
              />
              <Tooltip
                cursor={{ fill: "rgba(99,102,241,0.06)" }}
                formatter={(value: any, name: any) => {
                  if (name === "cost") return [`¥${value}`, "花费"];
                  if (name === "articles") return [value, "文章数"];
                  return [value, name];
                }}
                labelFormatter={(label) => `月份：${label}`}
              />
              <Legend
                formatter={(v) => (v === "cost" ? "花费 (¥)" : "文章数")}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cost"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="articles"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 右侧：明细表 */}
        <div className="overflow-y-auto max-h-[320px] min-h-[320px]">
          <table className="w-full text-xs">
            <thead className="text-gray-500 border-b border-gray-100">
              <tr>
                <th className="text-left py-2 pr-2 font-medium">月份</th>
                <th className="text-right py-2 px-2 font-medium">篇</th>
                <th className="text-right py-2 px-2 font-medium">字</th>
                <th className="text-right py-2 pl-2 font-medium">¥</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                data.map((r) => (
                  <tr key={r.ym} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-2 font-mono">{r.ym}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.articles}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.words.toLocaleString()}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{r.cost.toFixed(3)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
