/**
 * EmptyHint — 零文章 / 零用量空态引导
 */

import Link from "next/link";

export function EmptyHint({ variant = "no-articles" }: { variant?: "no-articles" | "no-logs" }) {
  if (variant === "no-logs") {
    return (
      <div className="card p-8 text-center border-dashed">
        <div className="text-3xl mb-2">📊</div>
        <p className="text-sm text-gray-600 mb-3">
          还没有 token 消耗记录
        </p>
        <p className="text-xs text-gray-400">
          在 <Link href="/write" className="text-brand-600 hover:underline">写作页</Link> 跑一次 Agent 自动写，就会出现数据
        </p>
      </div>
    );
  }

  return (
    <div className="card p-12 text-center border-dashed">
      <div className="text-5xl mb-3">📝</div>
      <h3 className="text-base font-medium mb-2">还没有创作记录</h3>
      <p className="text-sm text-gray-500 mb-4">
        在首页输入主题，让 Agent 帮你调研 + 写作
      </p>
      <Link href="/research" className="btn-primary inline-block">
        ✨ 开始创作 →
      </Link>
    </div>
  );
}
