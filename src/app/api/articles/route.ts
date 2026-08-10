/**
 * 文章 CRUD API (v0.1 重写版：直接 SQL，无 ORM)
 *
 * GET  /api/articles       - 列出文章
 * POST /api/articles       - 创建文章
 */

import { NextRequest, NextResponse } from "next/server";
import { db, generateUuid, countWords } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    let sql = "SELECT * FROM articles WHERE status IN ('draft','archived')";
    const params: any[] = [];
    if (status) {
      sql = "SELECT * FROM articles WHERE status = ?";
      params.push(status);
    }
    sql += " ORDER BY updated_at DESC";

    const articles = db.all(sql, params);
    return NextResponse.json({ articles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = "未命名文章",
      content = "",
      sourceType,
      sourceRef,
      directionIndex,
      style,
      sessionId,   // 关联 research_session，让 write 页可以反查方向
    } = body;

    const uuid = generateUuid();
    const wordCount = countWords(content);

    const r = db.run(
      `INSERT INTO articles (uuid, title, content, source_type, source_ref, direction_index, style, word_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        title,
        content,
        sourceType ?? null,
        sourceRef ?? null,
        directionIndex ?? null,
        style ?? null,
        wordCount,
      ]
    );

    const article = db.get("SELECT * FROM articles WHERE id = ?", [
      r.lastInsertRowid,
    ]);

    // 把 article_id 写回 research_session，让 write 页能反查方向 + 资料
    if (sessionId) {
      try {
        db.run(`UPDATE research_sessions SET article_id = ? WHERE id = ?`, [
          r.lastInsertRowid,
          sessionId,
        ]);
      } catch (err) {
        console.warn("写回 session.article_id 失败（不影响）:", err);
      }
    }

    // 驼峰化
    const camelArticle = article
      ? {
          ...article,
          sourceType: article.source_type,
          sourceRef: article.source_ref,
          directionIndex: article.direction_index,
          wordCount: article.word_count,
          updatedAt: article.updated_at,
        }
      : null;

    return NextResponse.json({ article: camelArticle });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
