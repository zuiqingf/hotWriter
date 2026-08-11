/**
 * POST /api/research
 * 关键词调研（SSE 流）
 */

import { NextRequest } from "next/server";
import { runKeywordAgent } from "@/lib/llm/agent";
import { db } from "@/lib/db";
import { logUsage } from "@/lib/cost/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { keyword, targetAudience, sourceUrl } = body;

  if (!keyword || typeof keyword !== "string" || keyword.length > 500) {
    return new Response(
      JSON.stringify({ error: "关键词必填，长度不超过 500" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
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
          // connection closed
        }
      };

      const startTime = Date.now();

      try {
        const result = await runKeywordAgent({
          keyword,
          targetAudience,
          sourceUrl: typeof sourceUrl === "string" ? sourceUrl : undefined,
          onStep: (step) => send("step", step),
        });

        // 保存会话
        const r = await db.run(
          `INSERT INTO research_sessions
           (keyword, user_input, research_log, directions, total_cost_cny, tool_call_count, model, source_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            keyword,
            keyword,
            JSON.stringify(result.steps),
            result.directions ? JSON.stringify(result.directions) : null,
            result.cost.totalCny,
            result.steps.filter((s) => s.type === "search").length,
            "deepseek-chat",
            typeof sourceUrl === "string" ? sourceUrl : null,
          ]
        );

        await logUsage({
          action: "research",
          model: "deepseek-chat",
          inputTokens: result.cost.inputTokens,
          outputTokens: result.cost.outputTokens,
          costCny: parseFloat(result.cost.totalCny),
          durationMs: Date.now() - startTime,
          sessionId: r.lastInsertRowid,
        });

        send("complete", {
          sessionId: r.lastInsertRowid,
          directions: result.directions,
          summary: result.summary,
          cost: result.cost,
          steps: result.steps,
          error: result.error,
        });
      } catch (err: any) {
        send("error", { message: err.message });
      } finally {
        controller.close();
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
