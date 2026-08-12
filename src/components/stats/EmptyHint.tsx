/**
 * EmptyHint — 零文章 / 零用量空态引导
 */

import Link from "next/link";

export function EmptyHint({ variant = "no-articles" }: { variant?: "no-articles" | "no-logs" }) {
  if (variant === "no-logs") {
    return (
      <div
        className="rounded-xl p-8 text-center border-dashed"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.15)",
        }}
      >
        <div className="text-3xl mb-2">📊</div>
        <p className="text-sm text-white/70 mb-3">
          还没有 token 消耗记录
        </p>
        <p className="text-xs text-white/40">
          在 <Link href="/write" className="text-accent-300 hover:underline">写作页</Link> 跑一次 Agent 自动写，就会出现数据
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-12 text-center border-dashed"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(255,255,255,0.15)",
      }}
    >
      <div className="text-5xl mb-3">📝</div>
      <h3 className="text-base font-medium mb-2 text-white">还没有创作记录</h3>
      <p className="text-sm text-white/50 mb-4">
        在首页输入主题，让 Agent 帮你调研 + 写作
      </p>
      <Link
        href="/research"
        className="inline-block text-sm px-4 py-2 rounded-lg font-medium text-white transition-all duration-300 hover:-translate-y-0.5"
        style={{
          background: "linear-gradient(135deg, #2C5BFF 0%, #A855F7 100%)",
          boxShadow: "0 4px 16px -4px rgba(168,85,247,0.5)",
        }}
      >
        ✨ 开始创作 →
      </Link>
    </div>
  );
}