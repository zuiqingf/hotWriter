"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedKeyword } from "@/lib/hot/keyphrases";

interface HeroSearchProps {
  /** 来自热榜的「热门话题」建议（含原文 URL）；为空时使用 fallback */
  keywords?: ExtractedKeyword[];
  /** dark 模式：黑色背景 + 白字（首页 Hero 用） */
  dark?: boolean;
}

const FALLBACK_KEYWORDS: ExtractedKeyword[] = [
  { keyword: "副业做博主靠谱吗", url: "" },
  { keyword: "如何高效阅读", url: "" },
];

export function HeroSearch({ keywords = [], dark = false }: HeroSearchProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [focused, setFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    router.push(`/research?keyword=${encodeURIComponent(keyword.trim())}`);
  };

  const handleSuggestionClick = (item: ExtractedKeyword) => {
    const qs = new URLSearchParams({
      keyword: item.keyword,
      source: "hot",
    });
    if (item.url) qs.set("url", item.url);
    router.push(`/research?${qs.toString()}`);
  };

  const examples = keywords.length >= 2 ? keywords : FALLBACK_KEYWORDS;

  if (dark) {
    return (
      <div>
        <form
          onSubmit={handleSubmit}
          className={`flex items-center gap-2 px-4 py-3.5 rounded-xl bg-white/[0.04] border transition-all ${
            focused
              ? "border-white/30"
              : "border-white/10 hover:border-white/20"
          }`}
          style={
            focused
              ? {
                  boxShadow:
                    "0 0 0 4px rgba(168,85,247,0.20), 0 8px 32px rgba(99,102,241,0.20)",
                  background: "rgba(255,255,255,0.06)",
                }
              : undefined
          }
        >
          <span className="text-white/40 text-sm shrink-0">🔍</span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="输入主题，例如：副业做博主靠谱吗"
            className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/30 outline-none"
          />
          <button
            type="submit"
            disabled={!keyword.trim()}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed text-white"
            style={{
              background: keyword.trim()
                ? "linear-gradient(135deg, #6E8CFF 0%, #A855F7 100%)"
                : "rgba(255,255,255,0.10)",
              boxShadow: keyword.trim()
                ? "0 4px 12px rgba(168,85,247,0.40)"
                : undefined,
            }}
          >
            开始研究
          </button>
        </form>

        {/* 热门建议 */}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/40 flex-wrap">
          <span className="text-white/30">试试：</span>
          {examples.slice(0, 5).map((item) => (
            <button
              key={item.keyword}
              type="button"
              onClick={() => handleSuggestionClick(item)}
              className="px-2.5 py-1 rounded-md text-white/60 hover:text-white hover:bg-white/[0.06] transition max-w-[180px] truncate"
              title={item.keyword}
            >
              {item.keyword}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 浅色版（兜底）
  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className={`flex items-center gap-2 px-4 py-3.5 bg-white border rounded-lg transition-all ${
          focused ? "border-accent-500" : "border-ink-100 hover:border-ink-300"
        }`}
        style={
          focused
            ? { boxShadow: "0 0 0 4px rgba(44,91,255,0.10)" }
            : undefined
        }
      >
        <span className="text-ink-300 text-sm shrink-0">🔍</span>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="输入主题"
          className="flex-1 bg-transparent text-[15px] text-ink-900 placeholder:text-ink-300 outline-none"
        />
        <button
          type="submit"
          disabled={!keyword.trim()}
          className="px-4 py-1.5 rounded text-sm font-medium bg-accent-500 text-white hover:bg-accent-600 disabled:bg-ink-100 disabled:text-ink-300 disabled:cursor-not-allowed transition"
        >
          开始研究
        </button>
      </form>
    </div>
  );
}