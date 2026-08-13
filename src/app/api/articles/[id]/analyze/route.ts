/**
 * POST /api/articles/[id]/analyze
 *
 * 单篇文章 → 与同赛道热门对比 → 4 维差距 + 建议。
 *
 * 与 auto-write 不同：本接口是非流式 LLM（response_format: json_object），
 * SSE 阶段用于：
 *   - start       通知前端"开始"，附带 article + direction + keyword
 *   - delta       进度文本（拉文章 / 搜 Tavily / 分析中…）
 *   - sections    4 维 gap + summary（解析后的结构化片段）
 *   - suggestions 可执行建议 list
 *   - complete    落库成功 + 最终 payload
 *   - error       失败
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { compareWithMarket } from "@/lib/analysis/compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface RouteContext {
  params: { id: string };
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const articleId = parseInt(ctx.params.id);
  if (isNaN(articleId)) {
    return new Response(
      JSON.stringify({ error: "invalid id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "DEEPSEEK_API_KEY 未配置" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 提前确认文章存在，避免后面才报 404
  const exists = await db.get("SELECT id, title FROM articles WHERE id = ?", [articleId]);
  if (!exists) {
    return new Response(
      JSON.stringify({ error: "文章不存在" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* swallow — controller 可能已被关闭 */
        }
      };

      send("start", {
        articleId,
        title: exists.title,
      });

      try {
        const result = await compareWithMarket(
          { articleId },
          (text) => send("delta", { text })
        );

        // 解析后的结构化片段先推给前端（不用等 complete）
        send("sections", {
          summary: result.payload.summary,
          gaps: result.payload.gaps,
        });
        send("suggestions", { items: result.payload.suggestions });

        // 落库到 article_analyses
        const insertRes = await db.run(
          `INSERT INTO article_analyses
             (article_id, payload, model, tokens_input, tokens_output, cost_cny, duration_ms, hot_refs)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            articleId,
            JSON.stringify(result.payload),
            result.usage.model,
            result.usage.tokensInput,
            result.usage.tokensOutput,
            result.usage.costCny.toFixed(6),
            result.usage.durationMs,
            JSON.stringify(
              result.hotRefs.map((r) => ({
                title: r.title,
                url: r.url,
                content: r.content,
                score: r.score,
              }))
            ),
          ]
        );

        send("complete", {
          analysisId: insertRes.lastInsertRowid,
          payload: result.payload,
          hotRefs: result.hotRefs,
          usage: result.usage,
        });
      } catch (err: any) {
        console.error("[analyze] 失败:", err);
        send("error", { message: err.message || "分析失败" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}