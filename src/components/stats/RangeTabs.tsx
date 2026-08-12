"use client";

/**
 * 时间范围切换：7天 / 30天 / 全部
 * 通过 router.replace 切换 URL searchParams，触发 server component 重取
 */

import { useRouter, usePathname } from "next/navigation";
import type { RangeKey } from "@/lib/stats/range";

const OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "all", label: "全部" },
];

export function RangeTabs({ current }: { current: RangeKey }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
      {OPTIONS.map((opt) => {
        const active = current === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => router.replace(`${pathname}?range=${opt.key}`)}
            className={`px-3 py-1 text-sm rounded-md transition ${
              active
                ? "bg-white text-brand-600 font-medium shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
