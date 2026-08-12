"use client";

/**
 * Pagination — 分页组件
 *
 * 显示首页 / 上一页 / 页码（带省略号）/ 下一页 / 末页
 * 点击 → router.replace('/library?style=X&page=N')
 */

import { useRouter, usePathname } from "next/navigation";

interface Props {
  currentPage: number;
  totalPages: number;
  currentStyle: string;
}

function buildPageList(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [];
  const around = new Set<number>([1, total, current, current - 1, current + 1]);
  for (let i = 1; i <= total; i++) {
    if (around.has(i)) pages.push(i);
  }
  const result: (number | "...")[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      const prev = pages[i - 1] as number;
      const cur = pages[i] as number;
      if (cur - prev > 1) result.push("...");
    }
    result.push(pages[i]);
  }
  return result;
}

export function Pagination({ currentPage, totalPages, currentStyle }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const go = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    router.replace(
      `${pathname}?style=${encodeURIComponent(currentStyle)}&page=${page}`
    );
  };

  const pages = buildPageList(currentPage, totalPages);

  const btn = (
    children: React.ReactNode,
    onClick: () => void,
    opts?: { active?: boolean; disabled?: boolean }
  ) => {
    if (opts?.active) {
      return (
        <button
          type="button"
          disabled
          className="min-w-[36px] h-9 px-3 inline-flex items-center justify-center text-sm rounded-md text-white border border-transparent"
          style={{
            background: "linear-gradient(135deg, #2C5BFF 0%, #A855F7 100%)",
            boxShadow: "0 0 16px -2px rgba(168,85,247,0.5)",
          }}
        >
          {children}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={opts?.disabled}
        className={`min-w-[36px] h-9 px-3 inline-flex items-center justify-center text-sm rounded-md border transition ${
          opts?.disabled
            ? "text-white/20 border-white/[0.06] cursor-not-allowed"
            : "text-white/70 border-white/10 hover:bg-white/[0.05] hover:text-white hover:border-white/20"
        }`}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="flex items-center justify-center gap-1.5">
      {btn("← 上一页", () => go(currentPage - 1), { disabled: currentPage <= 1 })}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} className="px-2 text-white/30 text-sm">
            …
          </span>
        ) : (
          btn(p, () => go(p as number), { active: p === currentPage })
        )
      )}
      {btn("下一页 →", () => go(currentPage + 1), { disabled: currentPage >= totalPages })}
    </div>
  );
}