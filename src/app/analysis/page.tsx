/**
 * /analysis — 用户创作分析页
 *
 * Server Component，解析 ?range=，并发 SQL 把结果传给 AnalysisClient。
 * 沿用 /stats/page.tsx 的 force-dynamic + async server component 模式。
 */

import { parseRange } from "@/lib/stats/range";
import { getAnalysisSnapshot } from "@/lib/analysis/queries";
import { RangeTabs } from "@/components/analysis/RangeTabs";
import { AnalysisClient } from "@/components/analysis/AnalysisClient";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const range = parseRange(searchParams.range);

  let snapshot;
  try {
    snapshot = await getAnalysisSnapshot(range);
  } catch (err: any) {
    console.error("[analysis] getAnalysisSnapshot 失败:", err);
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white scrollbar-hide">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(168, 85, 247, 0.18) 0%, transparent 60%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <h1 className="font-serif text-3xl text-white flex items-center gap-2.5 mb-4">
            <span
              className="inline-block w-1.5 h-7 rounded-full"
              style={{
                background: "linear-gradient(180deg, #6E8CFF 0%, #A855F7 100%)",
                boxShadow: "0 0 12px rgba(168,85,247,0.6)",
              }}
            />
            🔍 创作分析
          </h1>
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <div className="text-3xl mb-2">⚠️</div>
            <p className="text-sm text-red-300 mb-3">加载失败：{err.message}</p>
            <a
              href="/analysis"
              className="inline-block text-sm px-3 py-1.5 rounded-lg border border-white/10 text-white/70 hover:bg-white/[0.05] hover:text-white transition"
            >
              重试
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white scrollbar-hide">
      {/* 暗底柔光 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 100% 0%, rgba(110, 140, 255, 0.14) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 0% 100%, rgba(168, 85, 247, 0.12) 0%, transparent 60%)
          `,
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl text-white flex items-center gap-2.5">
              <span
                className="inline-block w-1.5 h-7 rounded-full"
                style={{
                  background: "linear-gradient(180deg, #6E8CFF 0%, #A855F7 100%)",
                  boxShadow: "0 0 12px rgba(168,85,247,0.6)",
                }}
              />
              🔍 创作分析
            </h1>
            <p className="text-sm text-white/50 mt-2">
              {snapshot.range.label}数据 ·{" "}
              {snapshot.hasAnyArticle
                ? `${snapshot.recentArticles.length} 篇文章`
                : "暂无文章"}
            </p>
          </div>
          <RangeTabs current={snapshot.range.key} />
        </div>

        <AnalysisClient snapshot={snapshot} />
      </div>
    </div>
  );
}