"use client";

/**
 * ResearchPanel — write 页对话区顶部的"调研详情"可折叠面板
 *
 * 显示用户选中方向（来自 research_sessions.directions JSON）的：
 * - 标题 / 角度
 * - 受众 / 语气 / 目标字数
 * - 提纲
 * - 关键素材
 * - 选定理由
 *
 * 默认收起（仅一行标题 + ▶），点开向下展开完整内容。
 */

import { useState } from "react";

export interface Direction {
  index: number;
  title: string;
  title_alt?: string;
  angle: string;
  target_audience: string;
  tone: string;
  word_count: number;
  outline: string[];
  key_materials: string[];
  rationale: string;
}

interface Props {
  keyword: string;
  direction: Direction | null;
  directionIndex: number | null;
  totalDirections: number;
}

export function ResearchPanel({ keyword, direction, directionIndex, totalDirections }: Props) {
  const [expanded, setExpanded] = useState(false);

  // 无方向 → 不渲染（避免空壳）
  if (!direction) return null;

  return (
    <div className="border-b border-gray-200/50 bg-gradient-to-b from-indigo-50/40 to-transparent">
      {/* ===== 折叠态：一行摘要 ===== */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/50 transition group"
        aria-expanded={expanded}
      >
        {/* 图标 */}
        <span className="text-base shrink-0">📋</span>

        {/* 主信息：方向标题 */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-gray-800 truncate">
            {direction.title}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            调研：{keyword}
            {totalDirections > 1 && directionIndex !== null && (
              <span className="ml-1.5 text-gray-400">
                · 第 {directionIndex} / {totalDirections} 个方向
              </span>
            )}
          </div>
        </div>

        {/* 切换箭头 */}
        <svg
          className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {/* ===== 展开态：完整详情 ===== */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 text-[12.5px] text-gray-700">
          {/* 角度 */}
          <Field label="角度" icon="📐">
            {direction.angle}
          </Field>

          {/* 元信息：受众 / 语气 / 字数 */}
          <div className="grid grid-cols-3 gap-2">
            <MiniField icon="🎯" label="受众" value={direction.target_audience} />
            <MiniField icon="🎙️" label="语气" value={direction.tone} />
            <MiniField
              icon="📊"
              label="字数"
              value={`≈ ${direction.word_count ?? "—"}`}
            />
          </div>

          {/* 提纲 */}
          {direction.outline && direction.outline.length > 0 && (
            <Field label={`提纲（${direction.outline.length} 段）`} icon="📝">
              <ol className="space-y-1 list-decimal list-inside text-gray-700 marker:text-gray-400">
                {direction.outline.map((o, i) => (
                  <li key={i} className="leading-relaxed">
                    {o}
                  </li>
                ))}
              </ol>
            </Field>
          )}

          {/* 关键素材 */}
          {direction.key_materials && direction.key_materials.length > 0 && (
            <Field label={`关键素材（${direction.key_materials.length} 条）`} icon="📚">
              <ul className="space-y-1 list-disc list-inside text-gray-700 marker:text-gray-400">
                {direction.key_materials.map((m, i) => (
                  <li key={i} className="leading-relaxed">
                    {m}
                  </li>
                ))}
              </ul>
            </Field>
          )}

          {/* 选定理由 */}
          {direction.rationale && (
            <Field label="为什么选这个方向" icon="💡">
              <p className="leading-relaxed text-gray-600 italic">
                {direction.rationale}
              </p>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

// ========== 子组件 ==========

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium mb-1">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}

function MiniField({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white/60 rounded px-2 py-1.5 border border-gray-100">
      <div className="text-[10px] text-gray-500 flex items-center gap-1">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[12px] text-gray-800 mt-0.5 truncate" title={value}>
        {value || "—"}
      </div>
    </div>
  );
}