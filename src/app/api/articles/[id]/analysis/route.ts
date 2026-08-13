/**
 * GET /api/articles/[id]/analysis
 *
 * 拉取指定文章的最近一次分析结果。
 * 用于 /analysis 页面点「查看分析」按钮的快速加载。
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLatestAnalysisPayload } from "@/lib/analysis/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const articleId = parseInt(ctx.params.id);
    if (isNaN(articleId)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }

    // 确认文章存在
    const article = await db.get(
      "SELECT id, title FROM articles WHERE id = ?",
      [articleId]
    );
    if (!article) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    const analysis = await getLatestAnalysisPayload(articleId);
    if (!analysis) {
      return NextResponse.json(
        { error: "暂无历史分析", payload: null },
        { status: 200 }
      );
    }

    return NextResponse.json({
      id: analysis.id,
      payload: analysis.payload,
      hotRefs: analysis.hotRefs,
      createdAt: analysis.createdAt,
      costCny: analysis.costCny,
      durationMs: analysis.durationMs,
      model: analysis.model,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}