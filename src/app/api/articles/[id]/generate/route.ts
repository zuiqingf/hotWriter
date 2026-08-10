/**
 * POST /api/articles/:id/generate
 * 根据方向 + 素材生成初稿
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMClient, MODEL_NAME } from "@/lib/llm/client";
import { SYSTEM_WRITER } from "@/lib/llm/prompts";
import { logUsage } from "@/lib/cost/tracker";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const articleId = parseInt(ctx.params.id);
  if (isNaN(articleId))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json();
  const { direction, outline, style, materials, title } = body;

  const article = db.get("SELECT * FROM articles WHERE id = ?", [articleId]);
  if (!article)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const finalStyle = style || article.style || "深度观点";
  const finalTitle = title || article.title || "未命名";

  const userPrompt = `请基于以下信息写一篇 ${finalStyle} 风格的文章：

## 标题（可微调）
${finalTitle}

## 写作方向
${direction}

## 提纲
${(outline || []).map((o: string, i: number) => `${i + 1}. ${o}`).join("\n")}

## 关键素材
${materials || "（无）"}

要求：
- Markdown 格式
- 标题用 #
- 章节用 ##
- 关键术语用 **加粗**
- 重要引用用 > 引用块
- 篇幅 ${article.word_count ? article.word_count + " 字左右" : "1500-2000 字"}

直接输出正文，不要额外解释。`;

  try {
    const client = getLLMClient();
    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: SYSTEM_WRITER },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0].message.content || "";
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = inputTokens * 0.000001 + outputTokens * 0.000002;

    db.run(
      `UPDATE articles
       SET content = ?, title = ?, style = ?, word_count = ?, updated_at = unixepoch()
       WHERE id = ?`,
      [content, finalTitle, finalStyle, content.length, articleId]
    );

    await logUsage({
      action: "write",
      model: MODEL_NAME,
      inputTokens,
      outputTokens,
      costCny: cost,
      durationMs: Date.now() - startTime,
      articleId,
    });

    return NextResponse.json({
      content,
      cost: {
        inputTokens,
        outputTokens,
        totalCny: cost.toFixed(4),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
