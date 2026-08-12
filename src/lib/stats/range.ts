/**
 * 时间范围解析
 *
 * 把 URL searchParams 里的字符串 ('7d' / '30d' / 'all') 转成 SQL 入参和 UI 配置。
 * 集中处理：秒级时间戳换算、月份回填、空值兜底。
 */

export type RangeKey = "7d" | "30d" | "all";

export interface RangeConfig {
  key: RangeKey;
  /** SQL 入参：created_at >= sinceTs（all 时为 0） */
  sinceTs: number;
  /** UI 显示文案 */
  label: string;
  /** 月度趋势要回填的月份数（含当前月）。7d/30d 都按 1 个月窗口（其实只够 1 个月） */
  months: number;
}

const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "近 7 天",
  "30d": "近 30 天",
  all: "全部",
};

export function parseRange(raw?: string | null): RangeConfig {
  const key: RangeKey =
    raw === "7d" || raw === "30d" || raw === "all" ? raw : "30d";

  const nowSec = Math.floor(Date.now() / 1000);
  const day = 86400;

  let sinceTs: number;
  let months: number;
  switch (key) {
    case "7d":
      sinceTs = nowSec - 7 * day;
      months = 1;
      break;
    case "30d":
      sinceTs = nowSec - 30 * day;
      months = 1;
      break;
    case "all":
      sinceTs = 0;
      months = 12; // v1 截断为最近 12 个月，避免跨多年查询
      break;
  }

  return {
    key,
    sinceTs,
    label: RANGE_LABELS[key],
    months,
  };
}

/**
 * 生成"近 N 个月"的 ym 数组（YYYY-MM 字符串），用于给月度趋势 SQL 结果补 0。
 * 例如 months=1 → 返回 [本月]；months=3 → [本月, 上月, 上上月]
 */
export function monthsAxis(months: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push(ym);
  }
  return out.reverse(); // 从旧到新
}
