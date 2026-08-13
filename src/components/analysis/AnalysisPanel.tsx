"use client";

/**
 * AnalysisPanel — 单篇文章分析结果面板
 *
 * 展示：
 *   - summary
 *   - 4 维度 gap 评分 + 问题 + 建议
 *   - 可执行建议 list
 *   - 同赛道 Top 5 引用（标题 + URL + whyBetter）
 *   - 成本 + 耗时（如果传入 usage）
 */

import { formatTimeAgo } from "@/lib/utils";

export interface AnalysisPanelPayload {
  summary: string;
  gaps: {
    title: { score: number; issue: string; suggestion: string };
    hook: { score: number; issue: string; suggestion: string };
    structure: { score: number; issue: string; suggestion: string };
    materials: { score: number; issue: string; suggestion: string };
  };
  suggestions: string[];
  hotRefs: { title: string; url: string; whyBetter: string }[];
}

interface Props {
  title: string;
  payload: AnalysisPanelPayload;
  /** 元信息：耗时 / cost / 模型 / 分析时间 */
  meta?: {
    analyzedAt?: number;
    durationMs?: number;
    costCny?: number;
    model?: string;
  };
}

const GAP_META: Record<string, { label: string; emoji: string }> = {
  title: { label: "标题吸引力", emoji: "✍️" },
  hook: { label: "开头 Hook", emoji: "🪝" },
  structure: { label: "论证结构", emoji: "🏗️" },
  materials: { label: "关键素材", emoji: "🧱" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "#10B981"; // emerald
  if (score >= 60) return "#F59E0B"; // amber
  return "#EF4444"; // red
}

function scoreTextColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

export function AnalysisPanel({ title, payload, meta }: Props) {
  const avgScore = Math.round(
    (payload.gaps.title.score +
      payload.gaps.hook.score +
      payload.gaps.structure.score +
      payload.gaps.materials.score) /
      4
  );

  return (
    <div className="space-y-4">
      {/* Header：标题 + summary + 总分 */}
      <section
        className="rounded-xl p-5"
        style={{
          background:
            "linear-gradient(135deg, rgba(110,140,255,0.10) 0%, rgba(168,85,247,0.10) 100%)",
          border: "1px solid rgba(168,85,247,0.20)",
        }}
      >
        <div className="flex items-start gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/50 mb-1">📊 文章分析结果</div>
            <div className="text-base font-medium text-white truncate" title={title}>
              {title}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ color: scoreColor(avgScore) }}
            >
              {avgScore}
            </div>
            <div className="text-[10px] text-white/50 mt-0.5">综合分</div>
          </div>
        </div>
        <p className="text-sm text-white/80 leading-relaxed">{payload.summary}</p>

        {meta && (
          <div className="flex items-center gap-3 mt-3 text-[11px] text-white/40">
            {meta.analyzedAt != null && <span>分析于 {formatTimeAgo(meta.analyzedAt)}</span>}
            {meta.durationMs != null && (
              <span>· 用时 {(meta.durationMs / 1000).toFixed(1)}s</span>
            )}
            {meta.costCny != null && <span>· 成本 ¥{meta.costCny.toFixed(4)}</span>}
            {meta.model && <span>· {meta.model}</span>}
          </div>
        )}
      </section>

      {/* 4 维度 gap */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(GAP_META).map(([key, meta2]) => {
          const gap = payload.gaps[key as keyof typeof payload.gaps];
          return (
            <div
              key={key}
              className="rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{meta2.emoji}</span>
                  <span className="text-sm font-medium text-white/90">
                    {meta2.label}
                  </span>
                </div>
                <span
                  className={`text-xl font-bold tabular-nums ${scoreTextColor(gap.score)}`}
                  style={{ color: scoreColor(gap.score) }}
                >
                  {gap.score}
                </span>
              </div>
              <div className="text-xs text-white/60 mb-1.5">
                <span className="text-white/40">问题：</span>
                {gap.issue || "—"}
              </div>
              <div className="text-xs text-white/80">
                <span className="text-white/40">建议：</span>
                {gap.suggestion || "—"}
              </div>
            </div>
          );
        })}
      </section>

      {/* 可执行建议 */}
      {payload.suggestions.length > 0 && (
        <section
          className="rounded-xl p-5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="text-sm font-medium text-white mb-3">
            💡 可执行优化建议（{payload.suggestions.length} 条）
          </div>
          <ul className="space-y-2.5">
            {payload.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/80 leading-relaxed">
                <span
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                  style={{
                    background: "linear-gradient(135deg, rgba(110,140,255,0.25) 0%, rgba(168,85,247,0.25) 100%)",
                    color: "#fff",
                  }}
                >
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 同赛道 Top 引用 */}
      {payload.hotRefs.length > 0 && (
        <section
          className="rounded-xl p-5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="text-sm font-medium text-white mb-3">
            🔥 同赛道 Top {payload.hotRefs.length} 热门文章
          </div>
          <ul className="space-y-3">
            {payload.hotRefs.map((r, i) => (
              <li key={i} className="text-sm">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/90 hover:text-accent-300 transition underline decoration-dotted decoration-white/30 underline-offset-4"
                  style={{ textDecorationColor: "rgba(168,85,247,0.4)" }}
                >
                  {r.title}
                </a>
                {r.whyBetter && (
                  <div className="text-xs text-white/50 mt-1 ml-1">
                    强在哪：{r.whyBetter}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {payload.hotRefs.length === 0 && (
        <section
          className="rounded-xl p-4 text-center text-xs text-white/50"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          暂无同赛道参考（未配置 Tavily 或搜索无结果）· 上述建议基于文章自身评估
        </section>
      )}
    </div>
  );
}