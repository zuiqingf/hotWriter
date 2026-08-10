"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedKeyword } from "@/lib/hot/keyphrases";

interface HeroSearchProps {
  /** 来自热榜的「热门话题」建议（含原文 URL）；为空时使用 fallback */
  keywords?: ExtractedKeyword[];
}

const FALLBACK_KEYWORDS: ExtractedKeyword[] = [
  { keyword: "副业做博主靠谱吗", url: "" },
  { keyword: "如何高效阅读", url: "" },
];

export function HeroSearch({ keywords = [] }: HeroSearchProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    // 手动输入没有来源 URL，传空 → agent 不会触发 fetch_url
    router.push(`/research?keyword=${encodeURIComponent(keyword.trim())}`);
  };

  // 点击建议词 → 直接跳到 /research，把 url 也带上
  const handleSuggestionClick = (item: ExtractedKeyword) => {
    const qs = new URLSearchParams({
      keyword: item.keyword,
      source: "hot",
    });
    if (item.url) qs.set("url", item.url);
    router.push(`/research?${qs.toString()}`);
  };

  // 真实数据不够时 fallback，保证显示
  const examples = keywords.length >= 2 ? keywords : FALLBACK_KEYWORDS;

  return (
    <section className="mb-8">
      <div className="bg-gradient-to-br from-brand-500 via-violet-500 to-purple-600 rounded-2xl p-8 text-white shadow-lg">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold mb-2">想写点什么？</h1>
          <p className="text-brand-100 mb-5 text-sm">
            输入你的主题，Agent 会自动检索并给你多个可写的方向。
          </p>
          <form
            onSubmit={handleSubmit}
            className="bg-white/10 backdrop-blur rounded-xl p-3 flex items-center gap-3 border border-white/20"
          >
            <span className="text-brand-100 text-lg">✨</span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例如：副业做博主靠谱吗 / 怎样高效阅读"
              className="flex-1 bg-transparent text-white placeholder:text-brand-200 outline-none text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-white text-brand-600 rounded-lg text-sm font-medium hover:bg-brand-50"
            >
              开始研究
            </button>
          </form>
          <div className="mt-3 flex items-center gap-2 text-xs text-brand-100 flex-wrap">
            <span>今日热门:</span>
            {examples.slice(0, 6).map((item) => (
              <button
                key={item.keyword}
                type="button"
                onClick={() => handleSuggestionClick(item)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 max-w-[180px] truncate"
                title={item.keyword}
              >
                {item.keyword}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
