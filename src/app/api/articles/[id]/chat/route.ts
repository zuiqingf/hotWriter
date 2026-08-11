/**
 * POST /api/articles/:id/chat
 * 多轮 AI 对话（SSE 流）
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getLLMClient, MODEL_NAME } from "@/lib/llm/client";
import { SYSTEM_WRITER } from "@/lib/llm/prompts";
import { logUsage } from "@/lib/cost/tracker";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const articleId = parseInt(ctx.params.id);
  if (isNaN(articleId)) return new Response("invalid id", { status: 400 });

  const body = await req.json();
  const { userInput } = body;
  if (!userInput?.trim()) return new Response("userInput required", { status: 400 });

  const article = await db.get("SELECT * FROM articles WHERE id = ?", [articleId]);
  if (!article) return new Response("not found", { status: 404 });

  // 历史消息
  const history = await db.all(
    "SELECT * FROM chat_messages WHERE article_id = ? ORDER BY created_at ASC LIMIT 30",
    [articleId]
  );

  const articleText = article.content || "（文章内容为空）";
  const systemPrompt = `${SYSTEM_WRITER}

## 当前文章状态
- 标题：${article.title}
- 风格：${article.style || "未指定"}
- 字数：${article.word_count || 0}
- 状态：${article.status}

## 文章内容
\`\`\`markdown
${articleText.length > 6000 ? articleText.slice(0, 6000) + "\n\n...（已截断）" : articleText}
\`\`\`
`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    { role: "user", content: userInput },
  ];

  // 持久化用户消息
  await db.run(
    "INSERT INTO chat_messages (article_id, role, content) VALUES (?, ?, ?)",
    [articleId, "user", userInput]
  );

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

      let fullReply = "";
      const startTime = Date.now();

      try {
        const client = getLLMClient();
        const completion = await client.chat.completions.create({
          model: MODEL_NAME,
          messages,
          stream: true,
          temperature: 0.7,
        });

        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            fullReply += text;
            send("delta", { text });
          }
        }

        await db.run(
          "INSERT INTO chat_messages (article_id, role, content) VALUES (?, ?, ?)",
          [articleId, "assistant", fullReply]
        );

        send("complete", {
          fullReply,
          durationMs: Date.now() - startTime,
        });

        const inputTokens = Math.ceil(JSON.stringify(messages).length / 3);
        const outputTokens = Math.ceil(fullReply.length / 2);
        await logUsage({
          action: "chat",
          model: MODEL_NAME,
          inputTokens,
          outputTokens,
          costCny: inputTokens * 0.000001 + outputTokens * 0.000002,
          durationMs: Date.now() - startTime,
          articleId,
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
