"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/library", label: "作品库" },
  { href: "/analysis", label: "分析" },
  { href: "/stats", label: "统计" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-30"
      style={{
        background: "rgba(10,10,15,0.72)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          {/* Logo：渐变 H 方块 + serif 字标 */}
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{
                background: "linear-gradient(135deg, #6E8CFF 0%, #A855F7 100%)",
                boxShadow: "0 4px 12px rgba(168,85,247,0.30), inset 0 1px 0 rgba(255,255,255,0.20)",
              }}
            >
              H
            </div>
            <span className="font-serif text-base font-semibold text-white tracking-tight">
              HotWriter
            </span>
          </Link>

          {/* 导航：玻璃胶囊 + 激活态发光 */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3.5 py-1.5 text-[13px] rounded-md transition ${active
                    ? "text-white"
                    : "text-white/55 hover:text-white hover:bg-white/[0.05]"
                    }`}
                  style={
                    active
                      ? {
                        background: "linear-gradient(135deg, rgba(110,140,255,0.18) 0%, rgba(168,85,247,0.18) 100%)",
                        border: "1px solid rgba(168,85,247,0.30)",
                        boxShadow:
                          "0 0 0 1px rgba(168,85,247,0.08), 0 2px 8px rgba(168,85,247,0.20)",
                      }
                      : {
                        border: "1px solid transparent",
                      }
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded"
            style={{
              color: "rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            v2.1
          </span>
        </div>
      </div>
    </header>
  );
}