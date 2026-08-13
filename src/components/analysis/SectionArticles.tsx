"use client";

/**
 * SectionArticles — 最近 N 篇文章列表
 *
 * 每条带「已分析 / 未分析」徽标 + 「查看分析 / 重新分析」按钮。
 * 点击后**就地展开**在 li 下方：进度条 → 完整结果（summary + 4 维 gap + 建议 + 同赛道引用）。
 *
 * 数据全部由父 AnalysisClient 通过 props 传入：
 *   - cache[articleId]  = { payload, meta }  // 已完成（含历史拉取）
 *   - progress[articleId] = { deltaText, stage }  // 流式进行中
 *   - error[articleId] = string  // 流式错误
 */

import type { AnalysisSnapshot } from "@/lib/analysis/queries";
import { formatTimeAgo } from "@/lib/utils";
import { AnalysisPanel, AnalysisPanelPayload } from "./AnalysisPanel";
import { AnalysisProgress } from "./AnalysisProgress";

export interface ArticleProgress {
  deltaText: string;
  stage: "fetch" | "search" | "thinking" | "done";
}

interface CachedAnalysis {
  payload: AnalysisPanelPayload;
  meta?: {
    analyzedAt?: number;
    durationMs?: number;
    costCny?: number;
    model?: string;
  };
}

interface Props {
  snapshot: AnalysisSnapshot;
  /** 当前正在分析的文章 id（用于按钮 loading 态） */
  analyzingId: number | null;
  /** 展开的"查看分析"目标 */
  expandedId: number | null;
  /** 文章 id → 已完成结果缓存 */
  cache: Record<number, CachedAnalysis>;
  /** 文章 id → 流式进度 */
  progress: Record<number, ArticleProgress>;
  /** 文章 id → 错误 */
  errors: Record<number, string>;
  onAnalyze: (articleId: number) => void;
  onView: (articleId: number) => void;
}

export function SectionArticles({
  snapshot,
  analyzingId,
  expandedId,
  cache,
  progress,
  errors,
  onAnalyze,
  onView,
}: Props) {
  const articles = snapshot.recentArticles;

  if (articles.length === 0) {
    return (
      <section className="stat-tile">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white">📝 最近文章</h3>
            <p className="text-xs text-white/50 mt-0.5">最近 20 篇 + 分析状态</p>
          </div>
        </div>
        <div className="py-12 text-center text-sm text-white/40">
          暂无文章
        </div>
      </section>
    );
  }

  return (
    <section className="stat-tile">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">📝 最近文章</h3>
          <p className="text-xs text-white/50 mt-0.5">
            最近 {articles.length} 篇 · 点击「分析」与同赛道热门对比
          </p>
        </div>
      </div>

      <ul className="divide-y divide-white/[0.06]">
        {articles.map((a) => {
          const isAnalyzing = analyzingId === a.id;
          const isExpanded = expandedId === a.id;
          const analyzed = a.analysisId != null;
          const cached = cache[a.id];
          const prog = progress[a.id];
          const err = errors[a.id];

          return (
            <li key={a.id}>
              {/* 标题行 */}
              <div className="py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-white/90 font-medium truncate" title={a.title}>
                      {a.title}
                    </span>
                    {analyzed ? (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                        style={{
                          background: "rgba(16,185,129,0.12)",
                          color: "#10B981",
                          border: "1px solid rgba(16,185,129,0.25)",
                        }}
                      >
                        ✓ 已分析 {formatTimeAgo(a.analyzedAt)}
                      </span>
                    ) : (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.5)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        未分析
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    <span className="truncate max-w-[180px]" title={a.directionTitle}>
                      🎯 {a.directionTitle}
                    </span>
                    {a.keyword && (
                      <span className="truncate max-w-[140px]" title={a.keyword}>
                        🔍 {a.keyword}
                      </span>
                    )}
                    <span className="tabular-nums">{a.wordCount.toLocaleString()} 字</span>
                    {a.style && <span>· {a.style}</span>}
                    <span className="text-white/30">· {formatTimeAgo(a.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {analyzed && !isAnalyzing && (
                    <button
                      type="button"
                      onClick={() => onView(a.id)}
                      className="text-xs px-3 py-1 rounded-md transition border"
                      style={
                        isExpanded
                          ? {
                              background:
                                "linear-gradient(135deg, #2C5BFF 0%, #A855F7 100%)",
                              borderColor: "transparent",
                              color: "#fff",
                            }
                          : {
                              background: "rgba(255,255,255,0.04)",
                              borderColor: "rgba(255,255,255,0.10)",
                              color: "rgba(255,255,255,0.7)",
                            }
                      }
                    >
                      {isExpanded ? "收起" : "查看分析"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAnalyze(a.id)}
                    disabled={isAnalyzing}
                    className="text-xs px-3 py-1 rounded-md transition border disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: isAnalyzing
                        ? "rgba(255,255,255,0.04)"
                        : "linear-gradient(135deg, rgba(110,140,255,0.18) 0%, rgba(168,85,247,0.18) 100%)",
                      borderColor: "rgba(168,85,247,0.30)",
                      color: "#fff",
                    }}
                  >
                    {isAnalyzing
                      ? "⏳ 分析中…"
                      : analyzed
                        ? "🔄 重新分析"
                        : "🔍 分析"}
                  </button>
                </div>
              </div>

              {/* 就地展开：进度 / 错误 / 完整结果 */}
              {isExpanded && (
                <div className="pb-4 pl-1">
                  {err && (
                    <div
                      className="rounded-xl p-3 text-xs mb-3"
                      style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        color: "#FCA5A5",
                      }}
                    >
                      ❌ {err}
                    </div>
                  )}

                  {isAnalyzing && !cached && (
                    <AnalysisProgress
                      deltaText={prog?.deltaText || "准备开始…"}
                      stage={prog?.stage || "fetch"}
                    />
                  )}

                  {cached && (
                    <AnalysisPanel
                      title={a.title}
                      payload={cached.payload}
                      meta={cached.meta}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}