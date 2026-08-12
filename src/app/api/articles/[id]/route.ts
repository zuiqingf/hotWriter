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

    const article = await db.get("SELECT * FROM articles WHERE id = ?", [id]);
    if (!article)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const messages = await db.all(
      "SELECT * FROM chat_messages WHERE article_id = ? ORDER BY created_at ASC",
      [id]
    );

    // 关联的调研 session（取最近一条；用于 write 页"调研详情"面板）
    const sessionRow = await db.get<{
      id: number;
      keyword: string;
      user_input: string | null;
      directions: string | null;
      source_url: string | null;
      created_at: number;
    }>(
      `SELECT id, keyword, user_input, directions, source_url, created_at
       FROM research_sessions
       WHERE article_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );

    // 解析 directions JSON + 提取选中的那一条（按 article.direction_index）
    let researchSession: {
      id: number;
      keyword: string;
      userInput: string | null;
      directions: any[];
      selectedDirection: any | null;
      sourceUrl: string | null;
      createdAt: number;
    } | null = null;
    if (sessionRow) {
      let dirs: any[] = [];
      try {
        dirs = sessionRow.directions ? JSON.parse(sessionRow.directions) : [];
      } catch {
        dirs = [];
      }
      const wantIdx = (article.direction_index ?? 1) - 1;
      const selected =
        wantIdx >= 0 && wantIdx < dirs.length ? dirs[wantIdx] : dirs[0] || null;
      researchSession = {
        id: sessionRow.id,
        keyword: sessionRow.keyword,
        userInput: sessionRow.user_input,
        directions: dirs,
        selectedDirection: selected,
        sourceUrl: sessionRow.source_url,
        createdAt: sessionRow.created_at,
      };
    }

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

    return NextResponse.json({
      article: camelArticle,
      messages: camelMessages,
      researchSession,
    });
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

    const old = await db.get("SELECT * FROM articles WHERE id = ?", [id]);
    if (!old)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    // 保存版本历史
    if (content !== undefined && content !== old.content) {
      await db.run(
        "INSERT INTO article_versions (article_id, content, title, `trigger`) VALUES (?, ?, ?, ?)",
        [id, old.content, old.title, "manual_save"]
      );
    }

    const updates: string[] = ["updated_at = UNIX_TIMESTAMP()"];
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
    await db.run(`UPDATE articles SET ${updates.join(", ")} WHERE id = ?`, params);

    const updated = await db.get("SELECT * FROM articles WHERE id = ?", [id]);
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

    await db.run("UPDATE articles SET status = 'deleted', updated_at = UNIX_TIMESTAMP() WHERE id = ?", [
      id,
    ]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
