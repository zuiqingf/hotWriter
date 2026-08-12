"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { HotListResult, HotTopicsData } from "@/lib/hot/fetcher";
import { formatTimeAgo, apiUrl } from "@/lib/utils";

interface HotListProps {
  /** SSR 注入的首屏数据，避免初始闪烁 */
  initialData: HotTopicsData;
}

const PLATFORM_META = {
  thepaper: {
    label: "澎湃新闻",
    color: "bg-red-100 text-red-700",
    icon: "📰",
    dotColor: "bg-red-600",
  },
  toutiao: {
    label: "今日头条",
    color: "bg-orange-100 text-orange-700",
    icon: "📰",
    dotColor: "bg-orange-500",
  },
  baidu: {
    label: "百度热搜",
    color: "bg-blue-100 text-blue-700",
    icon: "🔍",
    dotColor: "bg-blue-500",
  },
  douyin: {
    label: "抖音总榜",
    color: "bg-gray-100 text-gray-800",
    icon: "🎵",
    dotColor: "bg-gray-900",
  },
} as const;

export function HotList({ initialData }: HotListProps) {
  const platforms = ["thepaper", "toutiao", "baidu", "douyin"] as const;

  // 客户端 state：首屏用 SSR 数据，刷新后替换
  const [data, setData] = useState<HotTopicsData>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);

    try {
      // cache: "no-store" 强制不走 next-cache，每次都打后端
      const res = await fetch(apiUrl("/api/hot"), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh: HotTopicsData = await res.json();
      setData(fresh);
    } catch (err: any) {
      setError(err.message || "刷新失败");
      // 3s 后自动清除
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 3000);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  return (
    <section className="mb-12">
      {/* 标题区 */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
            🔥 四大平台热搜
            <span
              className={`text-xs font-normal text-white/40 transition-opacity duration-200 ${refreshing ? "opacity-40" : "opacity-100"
                }`}
            >
              · {formatTimeAgo(data.fetchedAt ? Math.floor(data.fetchedAt / 1000) : undefined)} 更新
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* 来源状态指示 */}

          {/* 真正的刷新按钮 */}
          <button
            onClick={refresh}
            disabled={refreshing}
            className={`text-xs px-2 py-1 rounded-md flex items-center gap-1
                       border border-white/10 hover:bg-white/5 text-white/70 hover:text-white
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all ${refreshing ? "text-accent-300" : ""
              }`}
            title="立即重新抓取三平台热榜（绕过 30 分钟缓存）"
            aria-label="刷新热榜"
          >
            <svg
              className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            {refreshing ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>

      {/* 错误提示条 */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <span>❌</span>
          <span>刷新失败：{error}</span>
        </div>
      )}

      {/* 四栏 */}
      <div
        className={`grid grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity duration-200 ${refreshing ? "opacity-50" : "opacity-100"
          }`}
      >
        {platforms.map((p) => {
          const meta = PLATFORM_META[p];
          const list = data[p].items;
          return (
            <div
              key={p}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col"
            >
              {/* 平台标题 */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{meta.icon}</span>
                  <h3 className="font-medium text-sm text-gray-900">{meta.label}</h3>
                </div>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${meta.color}`}
                >
                  Top {list.length}
                </span>
              </div>

              {/* 列表 */}
              <ol className="divide-y divide-gray-50 flex-1">
                {list.slice(0, 10).map((item) => (
                  <li
                    key={`${p}-${item.rank}`}
                    className="group hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      {/* 排名 */}
                      <span
                        className={`shrink-0 w-5 text-xs text-center font-mono font-bold ${item.rank <= 3
                            ? "text-red-600"
                            : item.rank <= 6
                              ? "text-orange-600"
                              : "text-gray-400"
                          }`}
                      >
                        {item.rank}
                      </span>
                      {/* 标题（占满除按钮外的空间） */}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 text-sm text-gray-800 group-hover:text-brand-600 line-clamp-2"
                      >
                        {item.title}
                      </a>
                      {/* 一键写图标按钮：默认半透明可见（避免 hover-only 导致触屏/快速划过点不到），hover 时高亮 */}
                      <Link
                        href={`/research?keyword=${encodeURIComponent(item.title)}&source=${p}&url=${encodeURIComponent(item.url)}&auto=1`}
                        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center
                                   text-base hover:text-brand-600 hover:bg-brand-50
                                   opacity-30 group-hover:opacity-100
                                   transition-opacity duration-150"
                        title="一键写：立刻基于这个热点让 AI 写文章"
                        aria-label="一键写"
                      >
                        ✍️
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>

              {/* 底部 */}
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                <span>前 10 条</span>
                <span
                  className={
                    data[p].source === "live" ? "text-emerald-600" : "text-amber-600"
                  }
                >
                  {data[p].source === "live" ? "● 实时" : "○ 兜底数据"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 错误提示 / 说明：遍历每个失败的平台 */}
      {!refreshing && platforms.some((p) => !data[p].ok) && (
        <div className="mt-3 space-y-1">
          {platforms.map((p) =>
            data[p].ok ? null : (
              <div
                key={p}
                className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800"
              >
                ⚠️ {PLATFORM_META[p].label}抓取失败（{data[p].error}）。显示数据为兜底。
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
