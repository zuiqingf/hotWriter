"use client";

/**
 * StatsClient — client 容器
 *
 * 接 server component 传来的 StatsSnapshot，按状态路由到 4 个 section + 空态。
 * 4 个 section 子组件各自 use client（recharts 需要），但 server data 走 props 传一次。
 */

import type { StatsSnapshot } from "@/lib/stats/queries";
import { SectionKpi } from "./SectionKpi";
import { SectionTrend } from "./SectionTrend";
import { SectionStyle } from "./SectionStyle";
import { SectionTokens } from "./SectionTokens";
import { EmptyHint } from "./EmptyHint";

interface Props {
  snapshot: StatsSnapshot;
}

export function StatsClient({ snapshot }: Props) {
  const { hasAnyArticle, hasAnyLog } = snapshot;

  // 零文章 → 全空态，只显示 KPI + EmptyHint
  if (!hasAnyArticle) {
    return (
      <>
        <SectionKpi snapshot={snapshot} />
        <EmptyHint variant="no-articles" />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <SectionKpi snapshot={snapshot} />
      <SectionTrend snapshot={snapshot} />
      <SectionStyle snapshot={snapshot} />
      {hasAnyLog ? (
        <SectionTokens snapshot={snapshot} />
      ) : (
        <EmptyHint variant="no-logs" />
      )}
    </div>
  );
}
