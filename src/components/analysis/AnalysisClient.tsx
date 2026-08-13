"use client";

/**
 * AnalysisClient — /analysis 页 client 容器
 *
 * 接 server component 传来的 AnalysisSnapshot，渲染：
 *   - 0 篇 → EmptyHint
 *   - 否则 → SectionHabits + SectionArticles
 *
 * 文章列表里点「查看分析 / 重新分析」→ 走 SSE → ArticleProgress / Cache →
 * SectionArticles 就地把 AnalysisPanel 渲染在该 li 下方。
 *
 * 关键状态：
 *   - analyzingId: 正在 SSE 流式的目标 article id
 *   - expandedId: 当前展开的"查看分析"目标
 *   - cache: 已完成分析（流式完成后 + 历史拉取后）
 *   - progress: 流式进行中（按 articleId 索引）
 *   - errors: 流式 / 加载历史错误
 */

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisSnapshot } from "@/lib/analysis/queries";
import { SectionHabits } from "./SectionHabits";
import {
  SectionArticles,
  type ArticleProgress,
} from "./SectionArticles";
import { AnalysisPanelPayload } from "./AnalysisPanel";
import { apiUrl } from "@/lib/utils";

interface Props {
  snapshot: AnalysisSnapshot;
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

export function AnalysisClient({ snapshot }: Props) {
  const router = useRouter();
  const { hasAnyArticle } = snapshot;

  const [cache, setCache] = useState<Record<number, CachedAnalysis>>({});
  const [progress, setProgress] = useState<Record<number, ArticleProgress>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // SSE reader 引用（用于 abort）
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 触发分析（首次或重新分析都走 SSE）
   */
  const handleAnalyze = useCallback(
    async (articleId: number) => {
      // 取消上一个（如果有）
      abortRef.current?.abort();

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setAnalyzingId(articleId);
      setExpandedId(articleId);
      setErrors((e) => {
        const { [articleId]: _, ...rest } = e;
        return rest;
      });
      setProgress((p) => ({
        ...p,
        [articleId]: { deltaText: "准备开始…", stage: "fetch" },
      }));

      try {
        const res = await fetch(apiUrl(`/api/articles/${articleId}/analyze`), {
          method: "POST",
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // 累加的 sections / suggestions（供 sections 事件后立即渲染）
        let partialPayload: AnalysisPanelPayload | null = null;
        let partialSuggestions: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE 协议：按 \n\n 切事件
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const evt of events) {
            const lineEvent = evt.match(/^event: (.+)$/m);
            const lineData = evt.match(/^data: (.+)$/m);
            if (!lineEvent || !lineData) continue;
            const eventName = lineEvent[1].trim();
            let payload: any = {};
            try {
              payload = JSON.parse(lineData[1]);
            } catch {
              /* swallow */
            }

            if (eventName === "start") {
              setProgress((p) => ({
                ...p,
                [articleId]: { deltaText: "✅ 已建立连接，开始拉取文章…", stage: "fetch" },
              }));
            } else if (eventName === "delta") {
              const text = payload.text || "";
              let stage: ArticleProgress["stage"] = "thinking";
              if (text.includes("搜索")) stage = "search";
              else if (text.includes("差距") || text.includes("分析")) stage = "thinking";
              else if (text.includes("完成")) stage = "done";
              setProgress((p) => ({
                ...p,
                [articleId]: { deltaText: text, stage },
              }));
            } else if (eventName === "sections") {
              partialPayload = {
                summary: payload.summary || "",
                gaps: payload.gaps || {
                  title: { score: 0, issue: "", suggestion: "" },
                  hook: { score: 0, issue: "", suggestion: "" },
                  structure: { score: 0, issue: "", suggestion: "" },
                  materials: { score: 0, issue: "", suggestion: "" },
                },
                suggestions: partialSuggestions,
                hotRefs: [],
              };
              setCache((c) => ({
                ...c,
                [articleId]: {
                  payload: partialPayload!,
                  meta: c[articleId]?.meta,
                },
              }));
            } else if (eventName === "suggestions") {
              partialSuggestions = payload.items || [];
              if (partialPayload) {
                partialPayload.suggestions = partialSuggestions;
                setCache((c) => ({
                  ...c,
                  [articleId]: {
                    payload: { ...partialPayload! },
                    meta: c[articleId]?.meta,
                  },
                }));
              }
            } else if (eventName === "complete") {
              const final: AnalysisPanelPayload = payload.payload;
              const usage = payload.usage || {};
              setCache((c) => ({
                ...c,
                [articleId]: {
                  payload: final,
                  meta: {
                    analyzedAt: Math.floor(Date.now() / 1000),
                    durationMs: usage.durationMs,
                    costCny: usage.costCny,
                    model: usage.model,
                  },
                },
              }));
              setProgress((p) => {
                const { [articleId]: _, ...rest } = p;
                return rest;
              });
              // 刷新 server 数据（更新 analyzed_at 时间戳 + 列表状态）
              router.refresh();
            } else if (eventName === "error") {
              throw new Error(payload.message || "分析失败");
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("[analysis] SSE 失败:", err);
        setErrors((e) => ({ ...e, [articleId]: err.message || "分析失败" }));
        setProgress((p) => {
          const { [articleId]: _, ...rest } = p;
          return rest;
        });
      } finally {
        setAnalyzingId(null);
      }
    },
    [router]
  );

  /**
   * 展开"查看分析"：优先用 cache；否则调 GET /api/articles/[id]/analysis
   */
  const handleView = useCallback(
    async (articleId: number) => {
      // 收起 / 展开切换
      if (expandedId === articleId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(articleId);
      setErrors((e) => {
        const { [articleId]: _, ...rest } = e;
        return rest;
      });

      if (cache[articleId]) return; // 已缓存

      try {
        const res = await fetch(apiUrl(`/api/articles/${articleId}/analysis`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.payload) {
          setErrors((e) => ({ ...e, [articleId]: "暂无历史分析" }));
          return;
        }
        setCache((c) => ({
          ...c,
          [articleId]: {
            payload: data.payload,
            meta: {
              analyzedAt: data.createdAt,
              durationMs: data.durationMs,
              costCny: data.costCny,
              model: data.model,
            },
          },
        }));
      } catch (err: any) {
        console.error("[analysis] 加载历史失败:", err);
        setErrors((e) => ({ ...e, [articleId]: err.message || "加载历史失败" }));
      }
    },
    [cache, expandedId]
  );

  // 0 篇 → 空态（仍展示 habits/directions/articles 但提示去写一篇）
  if (!hasAnyArticle) {
    return (
      <div className="space-y-6">
        <SectionHabits snapshot={snapshot} />
        <SectionArticles
          snapshot={snapshot}
          analyzingId={analyzingId}
          expandedId={expandedId}
          cache={cache}
          progress={progress}
          errors={errors}
          onAnalyze={handleAnalyze}
          onView={handleView}
        />
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm text-white/60">暂无文章，去写一篇吧～</p>
          <a
            href="/library"
            className="inline-block text-sm px-3 py-1.5 mt-3 rounded-lg border border-white/10 text-white/70 hover:bg-white/[0.05] hover:text-white transition"
          >
            前往作品库
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHabits snapshot={snapshot} />
      <SectionArticles
        snapshot={snapshot}
        analyzingId={analyzingId}
        expandedId={expandedId}
        cache={cache}
        progress={progress}
        errors={errors}
        onAnalyze={handleAnalyze}
        onView={handleView}
      />
    </div>
  );
}