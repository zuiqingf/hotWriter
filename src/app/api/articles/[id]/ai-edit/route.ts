/**
 * POST /api/articles/[id]/ai-edit
 *
 * 富文本编辑器内的 AI 改写能力（SSE 流）
 *
 * 输入：
 *   {
 *     action: 'polish' | 'expand' | 'shorten'
 *            | 'tone-formal' | 'tone-casual' | 'tone-persuasive'
 *            | 'translate-en' | 'explain' | 'summarize' | 'fix-grammar',
 *     text: string                  // 用户选中的文字
 *     context?: string              // 可选：标题 + 文章开头，给 LLM 一点上下文
 *   }
 *
 * 输出：SSE 流
 *   event: delta     data: { text: "..." }       每个 token
 *   event: complete  data: { full: "...", durationMs: 1234 }
 *   event: error     data: { message: "..." }
 *
 * 选中的文字由前端 stream 回来时直接 replaceSelection。
 */

import { NextRequest } from "next/server";
import { getLLMClient, MODEL_NAME } from "@/lib/llm/client";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface RouteContext {
  params: { id: string };
}

// ============ Action → Prompt ============
// 直接、单一任务的指令，每条都明确说"只输出结果，不要解释"
const ACTION_PROMPTS: Record<string, string> = {
  polish:
    "你是中文写作润色助手。请润色下面这段文字，让语言更流畅、表达更精准、逻辑更清晰。\n" +
    "要求：保持原意不变；不要扩写或缩写；不要添加新观点；不要解释、不要客套话；只输出润色后的结果。\n\n" +
    "【原文】\n{text}\n\n【润色】",

  expand:
    "你是中文写作扩写助手。请基于下面这段文字做合理扩写：补充细节、举例或解释，让内容更丰富。\n" +
    "要求：保持原意和风格；新增内容要与原文自然衔接；不要偏离主题；不要解释、不要客套话；只输出扩写后的结果。\n\n" +
    "【原文】\n{text}\n\n【扩写】",

  shorten:
    "你是中文写作缩写助手。请缩写下面这段文字，让它更简洁有力。\n" +
    "要求：保留核心信息和关键论据；删除冗余、重复、口水话；不要改变原意；不要解释、不要客套话；只输出缩写后的结果。\n\n" +
    "【原文】\n{text}\n\n【缩写】",

  "tone-formal":
    "你是中文写作语气调整助手。请把下面这段文字改成更正式的书面语（适合公众号/学术/报告）。\n" +
    "要求：使用书面词汇；避免口语化表达（吧、呢、哈、哦等）；句式更严谨；保持原意；不要解释、不要客套话；只输出改写后的结果。\n\n" +
    "【原文】\n{text}\n\n【正式】",

  "tone-casual":
    "你是中文写作语气调整助手。请把下面这段文字改成更口语化、亲和的版本（适合朋友圈/小红书）。\n" +
    "要求：自然、亲切；可以适度用第一人称；避免书面腔；保持原意；不要解释、不要客套话；只输出改写后的结果。\n\n" +
    "【原文】\n{text}\n\n【口语】",

  "tone-persuasive":
    "你是中文写作语气调整助手。请把下面这段文字改成更有说服力的版本（适合观点文/营销）。\n" +
    "要求：加强论证力度；适当用排比、设问；逻辑更紧凑；保持原意；不要解释、不要客套话；只输出改写后的结果。\n\n" +
    "【原文】\n{text}\n\n【更有说服力】",

  "translate-en":
    "你是中译英翻译。请把下面这段中文翻译成自然、地道的英文。\n" +
    "要求：保持原意；术语准确；避免机翻腔；不要解释、不要客套话；只输出译文。\n\n" +
    "【中文】\n{text}\n\n【英文】",

  explain:
    "你是知识解释助手。请用通俗易懂的语言解释下面这段文字里的关键概念或术语。\n" +
    "要求：用 1-3 句话解释清楚；给一个具体例子；不要堆砌术语；不要解释、不要客套话；只输出解释内容。\n\n" +
    "【原文】\n{text}\n\n【解释】",

  summarize:
    "你是中文写作摘要助手。请用一句话概括下面这段文字的核心信息。\n" +
    "要求：≤40 字；保留关键数据/结论；不要解释、不要客套话；只输出摘要。\n\n" +
    "【原文】\n{text}\n\n【摘要】",

  "fix-grammar":
    "你是中文校对助手。请纠正下面这段文字的错别字、语病、标点错误，保持原意。\n" +
    "要求：只改不改写；最小化改动；不要解释、不要客套话；只输出校对后的结果。\n\n" +
    "【原文】\n{text}\n\n【校对】",
};

export async function POST(req: NextRequest, ctx: RouteContext) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "DEEPSEEK_API_KEY 未配置" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { action, text, context } = body as {
    action?: string;
    text?: string;
    context?: string;
  };

  if (!action || !(action in ACTION_PROMPTS)) {
    return new Response(
      JSON.stringify({ error: `不支持的操作：${action}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "选中文本不能为空" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (text.length > 5000) {
    return new Response(
      JSON.stringify({ error: "选中文本超过 5000 字上限" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const promptTpl = ACTION_PROMPTS[action];
  const userPrompt = promptTpl.replace("{text}", text);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // 连接已关闭
        }
      };

      const startTime = Date.now();
      try {
        const client = getLLMClient();

        // 可选上下文：标题 + 文章开头 → 让 LLM 知道"在写什么"
        const systemMsg: ChatCompletionMessageParam = {
          role: "system",
          content: context
            ? `你是中文写作助手。当前文章上下文：\n${context}\n\n只输出改写结果，不要解释、不要客套话。`
            : "你是中文写作助手。只输出改写结果，不要解释、不要客套话。",
        };

        const completion = await client.chat.completions.create({
          model: MODEL_NAME,
          messages: [systemMsg, { role: "user", content: userPrompt }],
          stream: true,
          temperature: 0.7,
        });

        let full = "";
        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            full += text;
            send("delta", { text });
          }
        }

        send("complete", { full, durationMs: Date.now() - startTime });
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