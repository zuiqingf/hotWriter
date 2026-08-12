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
    <div
      className="inline-flex gap-1 p-1 rounded-lg"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {OPTIONS.map((opt) => {
        const active = current === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => router.replace(`${pathname}?range=${opt.key}`)}
            className={`px-3 py-1 text-sm rounded-md transition ${
              active
                ? "text-white font-medium"
                : "text-white/50 hover:text-white"
            }`}
            style={
              active
                ? {
                    background: "linear-gradient(135deg, #2C5BFF 0%, #A855F7 100%)",
                    boxShadow: "0 2px 8px -2px rgba(168,85,247,0.5)",
                  }
                : undefined
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}