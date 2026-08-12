"use client";

/**
 * StyleTabs — 风格分类顶部 tab
 *
 * 「全部 / 知乎 / 小红书 / ...」
 * 点击 → router.replace('/library?style=X&page=1')
 */

import { useRouter, usePathname } from "next/navigation";

interface Props {
  allStyles: { style: string; cnt: number }[];
  current: string;
}

export function StyleTabs({ allStyles, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // 总数（all tab 显示）
  const totalCnt = allStyles.reduce((s, r) => s + r.cnt, 0);

  const go = (style: string) => {
    router.replace(`${pathname}?style=${encodeURIComponent(style)}&page=1`);
  };

  const tabs: { key: string; label: string; cnt: number }[] = [
    { key: "all", label: "全部", cnt: totalCnt },
    ...allStyles.map((s) => ({ key: s.style, label: s.style, cnt: s.cnt })),
  ];

  return (
    <div className="border-b border-white/10 overflow-x-auto scrollbar-hide">
      <div className="flex items-center gap-1 -mb-px min-w-max">
        {tabs.map((t) => {
          const active = current === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => go(t.key)}
              className={`relative px-4 py-2.5 text-sm whitespace-nowrap transition border-b-2 ${
                active
                  ? "text-white font-medium"
                  : "text-white/50 hover:text-white border-transparent hover:border-white/15"
              }`}
              style={
                active
                  ? {
                      borderImage:
                        "linear-gradient(90deg, #6E8CFF 0%, #A855F7 100%) 1",
                      textShadow: "0 0 12px rgba(168,85,247,0.5)",
                    }
                  : undefined
              }
            >
              {t.label}
              <span
                className={`ml-1.5 text-xs tabular-nums ${
                  active ? "text-accent-300" : "text-white/30"
                }`}
              >
                {t.cnt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}