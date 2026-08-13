"use client";

/**
 * AnalysisProgress — SSE 阶段进度展示
 *
 * 父组件传 deltaText（最新进度文本） + 当前阶段。
 * 完成后由父组件切换到 AnalysisPanel 渲染结果。
 */

interface Props {
  deltaText: string;
  /** 阶段提示 */
  stage?: "fetch" | "search" | "thinking" | "done";
}

const STAGE_LABEL: Record<string, string> = {
  fetch: "拉取文章",
  search: "搜同赛道",
  thinking: "差距分析",
  done: "完成",
};

export function AnalysisProgress({ deltaText, stage = "thinking" }: Props) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(110,140,255,0.06)",
        border: "1px solid rgba(110,140,255,0.20)",
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="relative w-5 h-5">
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "rgba(168,85,247,0.4)" }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "linear-gradient(135deg, #6E8CFF 0%, #A855F7 100%)" }}
          />
        </div>
        <div className="text-sm font-medium text-white/90">
          {STAGE_LABEL[stage] || "分析中"}…
        </div>
      </div>
      <div className="text-xs text-white/60 leading-relaxed min-h-[1.5em]">
        {deltaText || "正在准备…"}
      </div>
    </div>
  );
}