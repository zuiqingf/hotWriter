"use client";

/**
 * SectionHabits — 创作习惯面板
 *
 * 时段分布柱图（24h）+ 工作日分布（周一~周日）+ 频率统计（活跃天数/总数/平均字数）
 *
 * 纯 SQL 渲染，无需 LLM。
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
} from "recharts";

interface Props {
  snapshot: AnalysisSnapshot;
}

const HOURLY_COLORS = {
  // 工作时间 9-18 / 晚高峰 19-22 配色不同，强化视觉
  work: "#A855F7",
  evening: "#6E8CFF",
  night: "rgba(255,255,255,0.25)",
};

function hourlyColor(hour: number): string {
  if (hour >= 19 && hour <= 22) return HOURLY_COLORS.evening;
  if (hour >= 9 && hour <= 18) return HOURLY_COLORS.work;
  return HOURLY_COLORS.night;
}

const DOW_LABELS: Record<number, string> = {
  1: "周日",
  2: "周一",
  3: "周二",
  4: "周三",
  5: "周四",
  6: "周五",
  7: "周六",
};

export function SectionHabits({ snapshot }: Props) {
  const { habits } = snapshot;

  // 补齐 0-23 时段（缺位补 0），让图表连续
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const found = habits.hourly.find((h) => h.hour === hour);
    return { hour, cnt: found?.cnt || 0 };
  });
  const hourlyData = hourly.map((d) => ({
    label: `${d.hour}`,
    cnt: d.cnt,
    color: hourlyColor(d.hour),
  }));

  // 工作日 1-7 补齐
  const dow = Array.from({ length: 7 }, (_, i) => {
    const dowNum = i + 1;
    const found = habits.daily.find((d) => d.dow === dowNum);
    return {
      dow: dowNum,
      label: DOW_LABELS[dowNum],
      cnt: found?.cnt || 0,
    };
  });
  const totalDow = dow.reduce((s, d) => s + d.cnt, 0) || 1;

  // 找出创作高峰
  const peakHour = hourly.reduce(
    (max, d) => (d.cnt > max.cnt ? d : max),
    hourly[0]
  );
  const peakDow = dow.reduce(
    (max, d) => (d.cnt > max.cnt ? d : max),
    dow[0]
  );

  return (
    <section className="stat-tile">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">⏰ 创作习惯</h3>
          <p className="text-xs text-white/50 mt-0.5">
            时段 + 工作日 + 频率 · 共 {habits.totalArticles} 篇
          </p>
        </div>
      </div>

      {/* KPI 三件套 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-xs text-white/50">活跃天数</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">
            {habits.activeDays}
          </div>
        </div>
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-xs text-white/50">总文章</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">
            {habits.totalArticles}
          </div>
        </div>
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-xs text-white/50">平均字数</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">
            {habits.avgWords.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 时段分布 */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-sm font-medium text-white/80">📅 时段分布（0-23 时）</h4>
          {peakHour.cnt > 0 && (
            <span className="text-xs text-white/50">
              高峰：<span className="text-white/80">{peakHour.hour}:00</span>（{peakHour.cnt} 篇）
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.4)"
              fontSize={10}
              interval={1}
            />
            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} allowDecimals={false} />
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
              formatter={(value: any) => [`${value} 篇`, "创作数"]}
              labelFormatter={(label) => `${label}:00`}
            />
            <Bar dataKey="cnt" radius={[3, 3, 0, 0]}>
              {hourlyData.map((d, i) => (
                <Bar key={i} dataKey="cnt" fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 工作日分布 */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-sm font-medium text-white/80">📆 工作日分布</h4>
          {peakDow.cnt > 0 && (
            <span className="text-xs text-white/50">
              偏好：<span className="text-white/80">{peakDow.label}</span>（{peakDow.cnt} 篇 · {Math.round((peakDow.cnt / totalDow) * 100)}%）
            </span>
          )}
        </div>
        <div className="flex items-end gap-2">
          {dow.map((d) => {
            const pct = Math.round((d.cnt / totalDow) * 100);
            const heightPx = Math.max(8, Math.round((d.cnt / Math.max(...dow.map((x) => x.cnt), 1)) * 80));
            return (
              <div key={d.dow} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] text-white/50 tabular-nums">{d.cnt}</div>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${heightPx}px`,
                    background: "linear-gradient(180deg, #6E8CFF 0%, #A855F7 100%)",
                    boxShadow: d.cnt === peakDow.cnt ? "0 0 12px rgba(168,85,247,0.6)" : undefined,
                    opacity: d.cnt === 0 ? 0.3 : 1,
                  }}
                />
                <div className="text-[10px] text-white/60">{d.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}