/**
 * compare.ts — 用户文章与同赛道热门文章对比的核心
 *
 * 流程：
 *   1. 拉文章 + 关联调研 session + 选定方向
 *   2. 用「方向角度 > 调研关键词 > 文章标题」做 Tavily 搜同赛道 Top 5
 *   3. 调 LLM（非流式 → response_format json_object），得到 4 维 gap + suggestions + hotRefs
 *   4. 返回结构化 payload（已校验字段）+ token / 耗时 / cost 给上层做 SSE 输出和落库
 *
 * 注意：
 *   - 这里用 **非流式** LLM 调用，因为分析结果需要结构化 JSON（流式解析 JSON 边际收益小）
 *   - SSE 阶段的 "delta" 事件我们就吐 "正在生成分析…" 这种轻量进度
 *   - Tavily 失败 / 缺 key 时降级：hotRefs=[]，LLM 纯基于文章自身评估
 */

import { db } from "@/lib/db";
import { stripHtml } from "@/lib/markdown";
import { tavilySearch, TavilyResult } from "@/lib/search/tavily";
import { getLLMClient, MODEL_NAME } from "@/lib/llm/client";
import { estimateCost, logUsage } from "@/lib/cost/tracker";
import { SYSTEM_ANALYST, buildUserPrompt, parseAnalysisPayload } from "./prompts";

export interface CompareInput {
  articleId: number;
}

export interface CompareResult {
  article: {
    id: number;
    title: string;
    wordCount: number;
    directionTitle: string;
    keyword: string;
  };
  hotRefs: TavilyResult[];
  payload: {
    summary: string;
    gaps: {
      title: { score: number; issue: string; suggestion: string };
      hook: { score: number; issue: string; suggestion: string };
      structure: { score: number; issue: string; suggestion: string };
      materials: { score: number; issue: string; suggestion: string };
    };
    suggestions: string[];
    hotRefs: { title: string; url: string; whyBetter: string }[];
  };
  usage: {
    tokensInput: number;
    tokensOutput: number;
    costCny: number;
    durationMs: number;
    model: string;
  };
}

/** 取文章 + 关联调研 + 选中的方向 */
async function fetchArticleContext(articleId: number) {
  const article = await db.get<{
    id: number;
    title: string;
    content: string;
    word_count: number;
    direction_index: number | null;
  }>(
    "SELECT id, title, content, word_count, direction_index FROM articles WHERE id = ?",
    [articleId]
  );
  if (!article) throw new Error("文章不存在");

  const session = await db.get<{ keyword: string; directions: string | null }>(
    `SELECT keyword, directions FROM research_sessions
     WHERE article_id = ? ORDER BY created_at DESC LIMIT 1`,
    [articleId]
  );

  let directionTitle = "";
  if (session?.directions) {
    try {
      const dirs = JSON.parse(session.directions) as any[];
      const wantIdx = (article.direction_index ?? 1) - 1;
      const picked = wantIdx >= 0 && wantIdx < dirs.length ? dirs[wantIdx] : dirs[0];
      directionTitle = picked?.title || picked?.angle || "";
    } catch {
      /* swallow */
    }
  }

  return {
    article: {
      id: article.id,
      title: article.title || "",
      content: article.content || "",
      wordCount: article.word_count || 0,
    },
    keyword: session?.keyword || "",
    directionTitle,
  };
}

/** 决定 Tavily 搜索关键词：方向角度 > 调研关键词 > 文章标题 */
function pickSearchKeyword(params: {
  directionTitle: string;
  keyword: string;
  title: string;
}): string {
  // 方向标题是「用户选定的主题」，最贴近"同赛道"
  if (params.directionTitle) return params.directionTitle;
  if (params.keyword) return params.keyword;
  return params.title || "";
}

/**
 * 对外入口：单篇文章 → 完整分析 payload
 *
 * @param onProgress 可选回调，用于 SSE 流式过程中给前端推阶段文本
 */
export async function compareWithMarket(
  input: CompareInput,
  onProgress?: (text: string) => void
): Promise<CompareResult> {
  const startTs = Date.now();
  onProgress?.("📄 正在拉取文章与调研…");

  const ctx = await fetchArticleContext(input.articleId);
  const plainText = stripHtml(ctx.article.content);

  const searchKeyword = pickSearchKeyword({
    directionTitle: ctx.directionTitle,
    keyword: ctx.keyword,
    title: ctx.article.title,
  });

  onProgress?.(`🔍 正在搜索同赛道热门文章：${searchKeyword || "（无关键词，将跳过）"}`);
  let hotRefs: TavilyResult[] = [];
  let tavilyAvailable = !!process.env.TAVILY_API_KEY;
  if (tavilyAvailable && searchKeyword) {
    try {
      const raw = await tavilySearch(searchKeyword, 5);
      // 过滤低相关度（score < 0.3 的不要；避免完全无关）
      hotRefs = raw.filter((r) => (r.score ?? 0) >= 0.3).slice(0, 5);
    } catch (err: any) {
      console.warn("[analysis] Tavily 搜索失败，降级:", err.message);
      hotRefs = [];
    }
  }

  onProgress?.(
    hotRefs.length > 0
      ? `🧠 已抓 ${hotRefs.length} 篇热门，正在做差距分析…`
      : "🧠 未抓到同赛道参考，将基于文章自身做分析…"
  );

  const userPrompt = buildUserPrompt({
    title: ctx.article.title,
    direction: ctx.directionTitle,
    keyword: ctx.keyword || searchKeyword,
    wordCount: ctx.article.wordCount,
    plainText,
    hotRefs: hotRefs.map((r) => ({ title: r.title, url: r.url, content: r.content })),
  });

  const client = getLLMClient();
  const completion = await client.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      { role: "system", content: SYSTEM_ANALYST },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = parseAnalysisPayload(raw);

  // 关键：hotRefs 里的 url 必须来自 Tavily 原始结果，避免 LLM 编 URL
  const validUrls = new Set(hotRefs.map((r) => r.url));
  parsed.hotRefs = parsed.hotRefs.filter((r: any) => validUrls.has(r.url));

  const usage = completion.usage;
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const cost = estimateCost(MODEL_NAME, inputTokens, outputTokens);
  const durationMs = Date.now() - startTs;

  onProgress?.(`✅ 分析完成 · 用时 ${(durationMs / 1000).toFixed(1)}s`);

  // 异步写 usage log（不阻塞）
  logUsage({
    action: "analysis",
    model: MODEL_NAME,
    inputTokens,
    outputTokens,
    costCny: cost.totalCny,
    durationMs,
    articleId: input.articleId,
  }).catch((e) => console.warn("[analysis] 写 usage_log 失败:", e));

  return {
    article: {
      id: ctx.article.id,
      title: ctx.article.title,
      wordCount: ctx.article.wordCount,
      directionTitle: ctx.directionTitle,
      keyword: ctx.keyword,
    },
    hotRefs,
    payload: parsed,
    usage: {
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      costCny: cost.totalCny,
      durationMs,
      model: MODEL_NAME,
    },
  };
}