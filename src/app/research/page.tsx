"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface AgentStep {
  type: string;
  tool?: string;
  message: string;
  timestamp: number;
}

interface Direction {
  index: number;
  title: string;
  title_alt?: string;
  angle: string;
  target_audience: string;
  tone: string;
  word_count: number;
  outline: string[];
  key_materials: string[];
  rationale: string;
}

interface FinalResult {
  sessionId?: number;
  directions?: Direction[];
  summary?: string;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    totalCny: string;
  };
  error?: string;
}

function ResearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyword = searchParams.get("keyword") || "";
  const auto = searchParams.get("auto") === "1";          // 一键写模式
  const sourceParam = searchParams.get("source") || "keyword"; // hot / keyword
  // 原始热点/文章 URL（来自首页热榜）。有值时，agent 必须先 fetch_url 读原文
  const sourceUrl = searchParams.get("url") || "";

  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [selectedDirection, setSelectedDirection] = useState<number | null>(null);
  const [creatingArticle, setCreatingArticle] = useState(false);
  // 控制调研进度条展开/折叠
  const [showSteps, setShowSteps] = useState(false);
  // 最多工具调用轮数（与 agent.ts 中的 MAX_ROUNDS 对齐）
  const MAX_ROUNDS = 8;

  // 🔒 防止 React Strict Mode 双调用 / 重复触发：每次"真正发起调研"前都要检查
  const startedRef = useRef(false);
  // 🔌 上一次 fetch 的 AbortController，用于"重新调研"时取消未结束的旧请求
  const abortRef = useRef<AbortController | null>(null);

  // 进入页面自动开始调研
  useEffect(() => {
    if (!keyword || startedRef.current) return;
    startedRef.current = true;
    startResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  async function startResearch() {
    // 取消上一次还在跑的请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("running");
    setSteps([]);
    setResult(null);
    setError("");

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, sourceUrl }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errText = await response.text();
        setError(errText || "请求失败");
        setStatus("done");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 标记：是否已经收到过 complete / error
      // 防止"两次流并发"时第一个的 complete 错误地把 UI 切到"完成"状态
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const eventMatch = line.match(/^event: (.+)\ndata: (.+)$/s);
          if (!eventMatch) continue;
          const [, event, dataJson] = eventMatch;
          try {
            const data = JSON.parse(dataJson);
            if (event === "step") {
              setSteps((prev) => [...prev, data]);
            } else if (event === "complete") {
              if (finished) continue;
              finished = true;
              setResult(data);
              setStatus("done");
            } else if (event === "error") {
              if (finished) continue;
              finished = true;
              setError(data.message || "未知错误");
              setStatus("done");
            }
          } catch (e) {
            console.warn("解析 SSE 失败:", e);
          }
        }
      }
    } catch (err: any) {
      // 用户主动取消（重新调研触发 abort）—— 不当作错误显示
      if (err.name === "AbortError") return;
      setError(err.message);
      setStatus("done");
    }
  }

  // 选择方向后跳转到写作工坊
  async function handleStartWriting(idxOverride?: number) {
    // 优先级：显式指定 > 用户选定 > 自动默认第一个
    const useIdx = idxOverride ?? selectedDirection ?? 0;
    if (!result?.directions) return;
    if (useIdx < 0 || useIdx >= result.directions.length) return;

    const direction = result.directions[useIdx];
    if (!direction) return;

    setCreatingArticle(true);
    setSelectedDirection(useIdx);

    try {
      // 先创建文章
      const createRes = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: direction.title,
          sourceType: sourceParam,            // "hot" 或 "keyword"
          sourceRef: keyword,
          directionIndex: direction.index,
          style: detectStyle(direction.angle),
          sessionId: result.sessionId,        // 关联回 session
        }),
      });

      if (!createRes.ok) throw new Error("创建文章失败");
      const { article } = await createRes.json();

      // 触发生成初稿
      fetch(`/api/articles/${article.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: `${direction.title}（${direction.angle}）：${direction.rationale}`,
          outline: direction.outline,
          materials: direction.key_materials?.join("\n"),
          style: detectStyle(direction.angle),
          title: direction.title,
        }),
      });

      // 不等生成完成，直接跳转
      router.push(`/write/${article.id}`);
    } catch (err: any) {
      setError(err.message);
      setCreatingArticle(false);
    }
  }

  // 一键写 auto 模式：仅自动选第一个方向（不自动跳转！）
  // 用户需要主动点"开始写这篇"，给用户选择权
  useEffect(() => {
    if (!auto) return;
    if (status !== "done") return;
    if (!result?.directions || result.directions.length === 0) return;
    if (selectedDirection === null) {
      setSelectedDirection(0);   // 默认选第一个
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, status, result]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:text-gray-700 mb-3 inline-block"
      >
        ← 返回首页
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            🔍 关键词调研
          </h1>
          <div className="text-lg text-gray-700 mt-1 font-medium">
            「{keyword}」
          </div>
        </div>
        {status === "done" && (
          <button
            onClick={() => {
              startedRef.current = true; // 允许重新启动（useEffect 依赖 keyword 不变不会再跑）
              startResearch();
            }}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            🔄 重新调研
          </button>
        )}
      </div>

      {/* 调研进度：摘要条 + 进度条 + 默认折叠 step 列表 */}
      {status === "running" && (
        <ResearchProgress
          steps={steps}
          showSteps={showSteps}
          onToggle={() => setShowSteps((s) => !s)}
          maxRounds={MAX_ROUNDS}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {/* 调研结果 */}
      {result?.directions && result.directions.length > 0 && (
        <>
          {result.summary && (
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-6 text-sm">
              <div className="font-medium text-brand-900 mb-1">💡 调研结论</div>
              <div className="text-brand-800">{result.summary}</div>
            </div>
          )}

          <h2 className="font-medium mb-3 text-gray-700">
            找到 {result.directions.length} 个写作方向
          </h2>

          {/* auto 模式默认选中逻辑仍然保留（首个方向），不再显示提示卡片 */}

          <div className="space-y-3">
            {result.directions.map((d, idx) => (
              <label
                key={idx}
                className={`block card p-5 cursor-pointer transition ${
                  selectedDirection === idx
                    ? "ring-2 ring-brand-500 border-brand-300"
                    : "hover:shadow-sm"
                }`}
              >
                <input
                  type="radio"
                  name="direction"
                  className="hidden"
                  checked={selectedDirection === idx}
                  onChange={() => setSelectedDirection(idx)}
                />
                <div className="flex items-start gap-3">
                  <div className="text-2xl">
                    {getAngleIcon(d.angle)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 font-medium">
                        方向 {d.index}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        {d.angle}
                      </span>
                      <span className="text-xs text-gray-500">
                        ~{d.word_count} 字 · {d.tone}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold mb-1">{d.title}</h3>
                    {d.title_alt && (
                      <div className="text-xs text-gray-500 mb-2">
                        备选：{d.title_alt}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mb-2">
                      👥 {d.target_audience}
                    </div>
                    <div className="text-sm text-gray-700 mb-3 italic">
                      {d.rationale}
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                        查看提纲与素材
                      </summary>
                      <div className="mt-2 pl-3 space-y-2">
                        <div>
                          <div className="font-medium mb-1">📑 提纲</div>
                          <ol className="space-y-0.5">
                            {d.outline.map((o, i) => (
                              <li key={i} className="text-gray-600">
                                {i + 1}. {o}
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div>
                          <div className="font-medium mb-1">📎 素材</div>
                          <ul className="space-y-0.5">
                            {d.key_materials?.map((m, i) => (
                              <li key={i} className="text-gray-600">
                                • {m}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* 底部操作栏 */}
          <div className="sticky bottom-0 mt-8 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              调研成本 ¥{result.cost?.totalCny} ·{" "}
              {steps.filter((s) => s.type === "search").length} 次检索
            </div>
            <button
              onClick={() => handleStartWriting()}
              disabled={
                !result?.directions?.length || creatingArticle
              }
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingArticle ? "创建中..." : "✍️ 开始写这篇"}
            </button>
          </div>
        </>
      )}

      {!result?.directions && status === "done" && !error && (
        <div className="text-center py-8 text-gray-400 text-sm">
          未能生成调研结果，请重试
        </div>
      )}
    </div>
  );
}

function getAngleIcon(angle: string): string {
  if (angle.includes("科普")) return "📘";
  if (angle.includes("数据")) return "📊";
  if (angle.includes("故事") || angle.includes("叙事")) return "🧪";
  if (angle.includes("争议") || angle.includes("评论")) return "⚡";
  if (angle.includes("实操") || angle.includes("清单")) return "✅";
  return "📝";
}

function detectStyle(angle: string): string {
  if (angle.includes("科普")) return "科普";
  if (angle.includes("数据")) return "观点";
  if (angle.includes("故事")) return "故事";
  if (angle.includes("争议")) return "短评";
  if (angle.includes("实操")) return "观点";
  return "观点";
}

export default function ResearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">加载中...</div>}>
      <ResearchContent />
    </Suspense>
  );
}

/* ---------- 调研进度卡（摘要 + 折叠的完整步骤） ---------- */
function ResearchProgress({
  steps,
  showSteps,
  onToggle,
  maxRounds,
}: {
  steps: AgentStep[];
  showSteps: boolean;
  onToggle: () => void;
  maxRounds: number;
}) {
  // 进度条：每 1 次 search + 1 次 thinking 算"一轮"，上限 maxRounds
  const rounds = Math.min(
    maxRounds,
    steps.filter((s) => s.type === "search" || s.type === "thinking").length
  );
  const searchCount = steps.filter((s) => s.type === "search").length;
  const lastMessage = steps[steps.length - 1]?.message ?? "准备中…";
  const progress = Math.round((rounds / maxRounds) * 100);

  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 to-white shadow-sm">
      {/* 折叠按钮 / 摘要区 */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-violet-50/40 transition"
      >
        {/* 状态点 */}
        <span className="relative shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </span>

        {/* 主信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-800">Agent 调研中</span>
            <span className="text-gray-400 text-xs">
              · 已搜 {searchCount} 次 / 最多 {maxRounds} 轮
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate mt-0.5">{lastMessage}</div>
        </div>

        {/* 折叠箭头 */}
        <span className="text-gray-400 text-xs px-2 py-1 rounded border border-gray-200 shrink-0">
          {showSteps ? "隐藏 ▲" : "展开 ▼"}
        </span>
      </button>

      {/* 进度条 */}
      <div className="px-4 pb-3">
        <div className="h-1 bg-violet-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400">
          <span>第 {rounds} / {maxRounds} 轮</span>
          <span>{progress}%</span>
        </div>
      </div>

      {/* 展开的完整步骤 */}
      {showSteps && (
        <div className="px-4 pb-4 pt-2 border-t border-violet-200">
          <div className="max-h-72 overflow-y-auto rounded-lg bg-white border border-violet-100 p-3 space-y-1.5 text-[13px] text-gray-700">
            {steps.length === 0 && (
              <div className="text-gray-400 text-xs">准备中…</div>
            )}
            {steps.map((s, i) => (
              <div key={i} className="leading-relaxed">
                {s.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
