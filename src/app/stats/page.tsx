/**
 * /stats — 创作统计页
 *
 * Server Component，解析 ?range=，并发 5 条 SQL，把结果传给 StatsClient。
 * 沿用 library/page.tsx 的 force-dynamic + async server component 模式。
 */

import { parseRange } from "@/lib/stats/range";
import { getStatsSnapshot } from "@/lib/stats/queries";
import { RangeTabs } from "@/components/stats/RangeTabs";
import { StatsClient } from "@/components/stats/StatsClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { range?: string };
}

export default async function StatsPage({ searchParams }: PageProps) {
  const range = parseRange(searchParams.range);

  let snapshot;
  try {
    snapshot = await getStatsSnapshot(range);
  } catch (err: any) {
    console.error("[stats] getStatsSnapshot 失败:", err);
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold mb-4">📊 创作统计</h1>
        <div className="card p-8 text-center border-red-200 bg-red-50">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-sm text-red-700 mb-3">加载失败：{err.message}</p>
          <a href="/stats" className="btn-secondary inline-block">重试</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header 行 */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">📊 创作统计</h1>
          <p className="text-sm text-gray-500 mt-1">
            {snapshot.range.label}数据 · {snapshot.hasAnyArticle ? `${snapshot.kpi.total} 篇文章` : "暂无文章"}
          </p>
        </div>
        <RangeTabs current={snapshot.range.key} />
      </div>

      <StatsClient snapshot={snapshot} />
    </div>
  );
}
