/**
 * SectionKpi — 4 块大数字卡
 *
 * 1. 总文章
 * 2. 已归档数（草稿不单独计数）
 * 3. 平均字数
 * 4. 本月花费（带预算进度条）
 */

import type { StatsSnapshot } from "@/lib/stats/queries";
import { formatTimeAgo } from "@/lib/utils";

interface Props {
  snapshot: StatsSnapshot;
}

function formatCny(n: number): string {
  if (n === 0) return "¥0";
  if (n < 0.01) return `¥${n.toFixed(4)}`;
  return `¥${n.toFixed(2)}`;
}

export function SectionKpi({ snapshot }: Props) {
  const { kpi, cost } = snapshot;
  const hasData = kpi.total > 0;

  // 预算三档配色
  const pctClamped = Math.min(cost.pct, 1.5);
  const overBudget = cost.pct >= 1;
  const warnBudget = cost.pct >= 0.66 && cost.pct < 1;
  const barColor = overBudget
    ? "bg-red-500"
    : warnBudget
      ? "bg-amber-500"
      : "bg-emerald-500";
  const barWidth = `${Math.min(pctClamped * 100, 100)}%`;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
      {/* 1. 总文章 */}
      <div className="stat-tile">
        <div className="stat-label">总文章</div>
        <div className="stat-num">{hasData ? kpi.total : "—"}</div>
        <div className="text-xs text-gray-500">
          {hasData
            ? `已归档 ${kpi.archived} 篇`
            : "暂无文章"}
        </div>
      </div>

      {/* 2. 平均字数 */}
      <div className="stat-tile">
        <div className="stat-label">平均字数</div>
        <div className="stat-num">{hasData ? kpi.avgWords.toLocaleString() : "—"}</div>
        <div className="text-xs text-gray-500">
          {hasData && kpi.lastCreatedAt
            ? `最近 ${formatTimeAgo(kpi.lastCreatedAt)}`
            : "按 status != deleted 计算"}
        </div>
      </div>

      {/* 3. 累计花费 */}
      <div className="stat-tile">
        <div className="stat-label">累计花费</div>
        <div className="stat-num">{formatCny(cost.totalCost)}</div>
        <div className="text-xs text-gray-500">
          {cost.logCount > 0 ? `${cost.logCount} 条调用记录` : "暂无调用记录"}
        </div>
      </div>

      {/* 4. 本月花费 + 预算进度条 */}
      <div className="stat-tile">
        <div className="stat-label">本月花费</div>
        <div className="stat-num">{formatCny(cost.monthCost)}</div>
        <div className="space-y-1.5">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all`}
              style={{ width: barWidth }}
            />
          </div>
          <div className="text-xs text-gray-500 flex items-center justify-between">
            <span>预算 ¥{cost.budget}</span>
            <span
              className={
                overBudget
                  ? "stat-delta-down font-medium"
                  : warnBudget
                    ? "text-amber-600 font-medium"
                    : "text-emerald-600"
              }
            >
              {Math.round(cost.pct * 100)}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
