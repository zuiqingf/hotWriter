"use client";

/**
 * SectionTokens — Token 消耗详情
 *
 * 左：PieChart (input vs output token)
 * 中：BarChart (按 action)
 * 右：明细表（action / 次数 / token / 花费）
 */

import type { StatsSnapshot } from "@/lib/stats/queries";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  snapshot: StatsSnapshot;
}

const PIE_COLORS = ["#6366f1", "#a855f7"]; // 输入 / 输出

const ACTION_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#3b82f6"];

// action 文案映射（纯中文，不带 emoji）
// 实际写入 SQL 的 action 取值见：api/research("research")、api/articles/[id]/chat("chat")、
// api/articles/[id]/generate("write")、api/articles/[id]/auto-write("write")、api/articles/[id]/ai-edit("ai-edit")
const ACTION_LABELS: Record<string, string> = {
  research: "调研",
  write: "改写",
  chat: "对话",
  "ai-edit": "AI 改写",
};

function fmtToken(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function SectionTokens({ snapshot }: Props) {
  const { tokens, hasAnyLog } = snapshot;

  if (!hasAnyLog) {
    return (
      <section className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-1">💸 Token 消耗详情</h3>
        <div className="py-12 text-center text-sm text-gray-400">
          暂无 token 记录，跑过一次自动写就会出现
        </div>
      </section>
    );
  }

  // Pie 数据
  const pieData = [
    { name: "输入", value: tokens.totalIn },
    { name: "输出", value: tokens.totalOut },
  ];

  // Bar 数据
  const barData = tokens.byAction.map((a, i) => ({
    ...a,
    color: ACTION_COLORS[i % ACTION_COLORS.length],
    label: ACTION_LABELS[a.action] || a.action,
  }));

  const totalTokens = tokens.totalIn + tokens.totalOut;

  return (
    <section className="card p-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">💸 Token 消耗详情</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            共 {totalTokens.toLocaleString()} tokens · 累计 ¥{tokens.totalCost.toFixed(4)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* 第 1 列：输入 vs 输出 */}
        <div className="flex flex-col min-h-[280px]">
          <div className="stat-label mb-2">输入 vs 输出</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                  fontSize={12}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => value.toLocaleString()}
                  labelFormatter={() => "Token 数量"}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 第 2 列：按动作 */}
        <div className="flex flex-col min-h-[280px]">
          <div className="stat-label mb-2">按动作</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="label"
                  stroke="#9ca3af"
                  fontSize={11}
                  interval={0}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={11}
                  tickFormatter={fmtToken}
                />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.06)" }}
                  formatter={(value: any) => value.toLocaleString()}
                  labelFormatter={() => "Token 数量"}
                />
                <Bar dataKey="tokens" radius={[4, 4, 0, 0]}>
                  {barData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 第 3 列：明细表 */}
        <div className="flex flex-col min-h-[280px]">
          <div className="stat-label mb-2">明细</div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b border-gray-100 sticky top-0 bg-white">
                <tr>
                  <th className="text-left py-5 pr-2 font-medium">动作</th>
                  <th className="text-right py-5 px-2 font-medium">次</th>
                  <th className="text-right py-5 px-2 font-medium">Token</th>
                  <th className="text-right py-5 pl-2 font-medium">¥</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {tokens.byAction.map((a) => (
                  <tr key={a.action} className="border-b border-gray-50 last:border-0">
                    <td className="py-5 pr-2">{ACTION_LABELS[a.action] || a.action}</td>
                    <td className="py-5 px-2 text-right tabular-nums">{a.cnt}</td>
                    <td className="py-5 px-2 text-right tabular-nums">{a.tokens.toLocaleString()}</td>
                    <td className="py-5 pl-2 text-right tabular-nums">{a.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
