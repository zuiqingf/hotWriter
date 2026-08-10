/**
 * POST /api/articles/[id]/auto-write
 *
 * write 页调用的"Agent 自动写"接口
 *
 * 设计：
 * - 自动反向查 article 关联的 research_session
 * - 提取该用户选中的方向（direction_index 标记）
 * - 从 session.directions JSON 中拿 outline + key_materials
 * - 拼 prompt → LLM 流式输出
 * - SSE 实时推送每段文本，客户端可填到 textarea
 *
 * 请求体（可选，用于覆盖默认 prompt 片段）:
 *   { extraInstructions?: string, style?: string }
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getLLMClient, MODEL_NAME } from "@/lib/llm/client";
import { getPlatformSystemPrompt, PLATFORMS } from "@/lib/llm/prompts";
import { logUsage } from "@/lib/cost/tracker";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

interface RouteContext {
  params: { id: string };
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

export async function POST(req: NextRequest, ctx: RouteContext) {
  const articleId = parseInt(ctx.params.id);
  if (isNaN(articleId)) {
    return new Response("invalid id", { status: 400 });
  }

  // 1. 读 article
  const article = db.get<{
    id: number;
    title: string;
    content: string | null;
    source_type: string | null;
    source_ref: string | null;
    direction_index: number | null;
    style: string | null;
    word_count: number | null;
  }>("SELECT * FROM articles WHERE id = ?", [articleId]);
  if (!article) {
    return new Response("not found", { status: 404 });
  }

  // 2. 反向查 research_session（按 article_id）
  const session = db.get<{
    id: number;
    keyword: string;
    directions: string | null;
    research_log: string | null;
  }>(
    `SELECT id, keyword, directions, research_log
     FROM research_sessions
     WHERE article_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [articleId]
  );

  // 3. 解析方向、提纲、素材
  let direction: Direction | null = null;
  let outline: string[] = [];
  let materials = "";
  let fallbackReason = "";

  if (session?.directions) {
    try {
      const dirs: Direction[] = JSON.parse(session.directions);
      const wantIdx = (article.direction_index ?? 1) - 1;
      direction = dirs[wantIdx] || dirs[0] || null;

      if (direction) {
        outline = direction.outline ?? [];
        materials = (direction.key_materials ?? []).join("\n");
      }
    } catch (err) {
      console.warn("解析 session.directions 失败:", err);
    }
  }

  if (!direction) {
    fallbackReason = "未找到关联调研方向，使用通用 prompt";
  }

  // 4. 拼 user prompt
  const body = await req.json().catch(() => ({}));
  const extraInstructions: string = body?.extraInstructions ?? "";

  // 平台参数：zhihu / xiaohongshu / toutiao
  const platformKey = body?.platform ?? "";
  const platform =
    platformKey in PLATFORMS
      ? (platformKey as keyof typeof PLATFORMS)
      : null;

  const title = article.title || session?.keyword || "未命名";
  const style = body?.style || article.style || "深度观点";
  const keyword = article.source_ref || session?.keyword || "";

  const directionDesc = direction
    ? `${direction.title}（${direction.angle}）：${direction.rationale}`
    : `基于关键词「${keyword}」自由发挥`;

  const userPrompt = `请基于以下信息写一篇 ${style} 风格的文章：

## 标题（可微调）
${title}

## 来源主题
${keyword}

## 写作方向
${directionDesc}

## 提纲
${outline.length > 0 ? outline.map((o, i) => `${i + 1}. ${o}`).join("\n") : "（无，自由发挥）"}

## 关键素材 / 数据 / 引用
${materials || "（无）"}

${fallbackReason ? `// 注：${fallbackReason}\n` : ""}
${extraInstructions ? `## 额外要求\n${extraInstructions}\n` : ""}
## 输出要求
- Markdown 格式
- 一级标题用 #，二级用 ##，三级 ###
- 关键术语用 **加粗**
- 重要引用用 > 引用块
- 字数 ≈ ${direction?.word_count ?? 1200}

直接输出正文，不要解释。`;

  // 5. 流式生成
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {}
      };

      let fullContent = "";
      const startTime = Date.now();
      let inputTokens = 0;
      let outputTokens = 0;

      // 立刻推一句"开始生成"的提示
      send("start", {
        direction: direction?.title || null,
        style,
        wordCount: direction?.word_count ?? 1200,
      });

      try {
        const client = getLLMClient();

        // 选平台 prompt（默认走通用 writer prompt）
        const systemPrompt = platform
          ? getPlatformSystemPrompt(platform)
          : getPlatformSystemPrompt("toutiao"); // 未指定平台时，兜底走头条风格

        const messages: ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ];

        const completion = await client.chat.completions.create({
          model: MODEL_NAME,
          messages,
          stream: true,
          temperature: 0.7,
        });

        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            fullContent += text;
            send("delta", { text });
          }
        }

        // 6. 把生成结果写回 article.content
        await writeBack(articleId, title, fullContent, style, controller);

        inputTokens = Math.ceil(JSON.stringify(messages).length / 3);
        outputTokens = Math.ceil(fullContent.length / 2);
        const cost = inputTokens * 0.000001 + outputTokens * 0.000002;

        // 写一条 assistant 消息到 chat_messages
        await logAssistantMsg(articleId, fullContent);

        await logUsage({
          action: "write",
          model: MODEL_NAME,
          inputTokens,
          outputTokens,
          costCny: cost,
          durationMs: Date.now() - startTime,
          articleId,
        });

        send("complete", {
          fullContent,
          durationMs: Date.now() - startTime,
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

  // helper moved out
}

// ===================== Helpers =====================
async function writeBack(
  articleId: number,
  title: string,
  content: string,
  style: string,
  controller: ReadableStreamDefaultController
) {
  try {
    db.run(
      `UPDATE articles
       SET content = ?, title = ?, style = ?, word_count = ?, updated_at = unixepoch()
       WHERE id = ?`,
      [content, title, style, content.length, articleId]
    );
  } catch (err) {
    console.error("写回 article 失败:", err);
  }
}

async function logAssistantMsg(articleId: number, content: string) {
  try {
    db.run(
      `INSERT INTO article_versions (article_id, content, title, trigger)
       VALUES (?, ?, ?, ?)`,
      [articleId, content, null, "auto_write"]
    );
  } catch (err) {
    console.warn("记录自动写历史失败:", err);
  }
}
