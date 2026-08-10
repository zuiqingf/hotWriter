/**
 * GET /api/hot
 *
 * 三平台热榜（微博/头条/百度，每平台前 10）
 * 缓存 30 分钟（Next.js fetch revalidate）
 */

import { NextResponse } from "next/server";
import { fetchAllHotTopics } from "@/lib/hot/fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchAllHotTopics();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
