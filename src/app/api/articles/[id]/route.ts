/**
 * 单篇文章操作
 */

import { NextRequest, NextResponse } from "next/server";
import { db, countWords } from "@/lib/db";

export const runtime = "nodejs";

interface RouteContext {
  params: { id: string };
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const id = parseInt(ctx.params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "invalid id" }, { status: 400 });

    const article = db.get("SELECT * FROM articles WHERE id = ?", [id]);
    if (!article)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const messages = db.all(
      "SELECT * FROM chat_messages WHERE article_id = ? ORDER BY created_at ASC",
      [id]
    );

    // 字段名驼峰化（前端用 camelCase，DB 是 snake_case）
    const camelArticle = {
      ...article,
      sourceType: article.source_type,
      sourceRef: article.source_ref,
      directionIndex: article.direction_index,
      wordCount: article.word_count,
      updatedAt: article.updated_at,
    };
    const camelMessages = messages.map((m) => ({
      ...m,
      articleId: m.article_id,
      tokensUsed: m.tokens_used,
      costCny: m.cost_cny,
      createdAt: m.created_at,
    }));

    return NextResponse.json({ article: camelArticle, messages: camelMessages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const id = parseInt(ctx.params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "invalid id" }, { status: 400 });

    const body = await req.json();
    const { title, content, style, status } = body;

    const old = db.get("SELECT * FROM articles WHERE id = ?", [id]);
    if (!old)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    // 保存版本历史
    if (content !== undefined && content !== old.content) {
      db.run(
        "INSERT INTO article_versions (article_id, content, title, trigger) VALUES (?, ?, ?, ?)",
        [id, old.content, old.title, "manual_save"]
      );
    }

    const updates: string[] = ["updated_at = unixepoch()"];
    const params: any[] = [];

    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title);
    }
    if (content !== undefined) {
      updates.push("content = ?");
      params.push(content);
      updates.push("word_count = ?");
      params.push(countWords(content));
    }
    if (style !== undefined) {
      updates.push("style = ?");
      params.push(style);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }

    params.push(id);
    db.run(`UPDATE articles SET ${updates.join(", ")} WHERE id = ?`, params);

    const updated = db.get("SELECT * FROM articles WHERE id = ?", [id]);
    // 兼容字段名：驼峰给前端
    const camel = {
      ...updated,
      sourceType: updated.source_type,
      sourceRef: updated.source_ref,
      directionIndex: updated.direction_index,
      wordCount: updated.word_count,
      updatedAt: updated.updated_at,
    };
    return NextResponse.json({ article: camel });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const id = parseInt(ctx.params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "invalid id" }, { status: 400 });

    db.run("UPDATE articles SET status = 'deleted', updated_at = unixepoch() WHERE id = ?", [
      id,
    ]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
