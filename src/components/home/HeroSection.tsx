"use client";

import { useRef } from "react";
import { HeroSearch } from "@/components/home/HeroSearch";
import type { ExtractedKeyword } from "@/lib/hot/keyphrases";
import {
  HomeAnimations,
  MetricCountUp,
  useInView,
} from "@/components/home/HomeAnimations";
import { useTypewriter, Cursor } from "@/components/home/Typewriter";

const TITLE_LINE_1 = "从一个想法";
const TITLE_LINE_2 = "到一篇文章";
const SUBTITLE =
  "调研方向 · 写作全文 · 对话打磨。\n一站式完成公众号、知乎、小红书、头条各平台内容。";

/**
 * HeroSection —— 首页 Hero 区的客户端组件
 * 负责：标题打字机 / 鼠标光晕 / 搜索框聚焦 / 数字 count-up。
 * 副标题不做动画，直接显示。
 */
export function HeroSection({ keywords }: { keywords: ExtractedKeyword[] }) {
  const titleLine1Ref = useRef<HTMLSpanElement>(null);
  const titleLine2Ref = useRef<HTMLParagraphElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const metricRowRef = useRef<HTMLDivElement>(null);

  const metricInView = useInView(metricRowRef, { threshold: 0.3 });

  // 标题打字机：每字 130ms，line1 与 line2 之间间隔 400ms
  const CHAR_DELAY = 130;
  const INTER_LINE_GAP = 400;
  const START = 200;

  const line1 = useTypewriter(TITLE_LINE_1, START, CHAR_DELAY, true);
  const line2 = useTypewriter(
    TITLE_LINE_2,
    START + TITLE_LINE_1.length * CHAR_DELAY + INTER_LINE_GAP,
    CHAR_DELAY,
    true
  );

  return (
    <div className="relative max-w-5xl mx-auto px-6 pt-28 pb-32">
      {/* 鼠标光晕覆盖层（仅跟随鼠标） */}
      <HomeAnimations
        titleLine1Ref={titleLine1Ref}
        titleLine2Ref={titleLine2Ref}
        subtitleRef={subtitleRef}
        searchRef={searchRef}
        metricRowRef={metricRowRef}
        sectionsRef={metricRowRef}
      />

      {/* === 装饰小标（玻璃徽章） === */}
      <div className="flex justify-center mb-10">
        <div
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full text-[11px] font-medium tracking-wide"
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <span className="relative flex items-center justify-center">
            <span className="absolute w-2 h-2 rounded-full bg-accent-400 animate-ping opacity-75" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-accent-400" />
          </span>
          <span className="text-white/90">HotWriter</span>
          <span className="text-white/30">·</span>
          <span className="text-white/60">AI 写作助手</span>
          <span
            className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider"
            style={{
              background: "linear-gradient(135deg, #2C5BFF, #A855F7)",
            }}
          >
            v2
          </span>
        </div>
      </div>

      {/* === 主标题（带打字机 + 光标） === */}
      <h1 className="text-center font-serif text-6xl md:text-7xl lg:text-8xl font-medium leading-[1.05] tracking-tight mb-8">
        <span
          ref={titleLine1Ref}
          style={{
            background:
              "linear-gradient(180deg, #ffffff 0%, #ffffff 60%, rgba(255,255,255,0.65) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {line1}
          {line1.length === TITLE_LINE_1.length ? null : <Cursor />}
        </span>
        <br />
        <span
          ref={titleLine2Ref}
          style={{
            background:
              "linear-gradient(135deg, #6E8CFF 0%, #A855F7 50%, #EC4899 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
          className="italic"
        >
          {line2}
          {line2.length === TITLE_LINE_2.length ? null : <Cursor />}
        </span>
        <span className="text-white"></span>
      </h1>

      {/* === 副标题（无动画，直接显示） === */}
      <p
        ref={subtitleRef}
        className="text-center text-base md:text-lg text-white/55 max-w-2xl mx-auto leading-relaxed mb-14 whitespace-pre-line"
      >
        {SUBTITLE}
      </p>

      {/* === 搜索框（hover 微浮起 + 扫光 + focus 边框呼吸） === */}
      <div ref={searchRef} className="group/search relative max-w-2xl mx-auto">
        <div
          className="
            relative rounded-2xl p-2
            bg-[#0a0a0f] backdrop-blur-xl
            border border-white/[0.08]
            shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-10px_rgba(99,102,241,0.25)]
            transition-all duration-300 ease-out
            hover:border-white/[0.25]
            hover:-translate-y-0.5
            hover:scale-[1.015]
            hover:shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_30px_80px_-10px_rgba(168,85,247,0.45),0_0_0_4px_rgba(168,85,247,0.10)]
            focus-within:animate-[focus-border-glow_2.5s_ease-in-out_infinite]
          "
        >
          {/* 内部扫光：hover 时一道斜光从左划到右 */}
          <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <span
              className="
                absolute inset-y-0 -left-full w-1/2
                bg-gradient-to-r from-transparent via-white/20 to-transparent
                -skew-x-12
                transition-[left] duration-700 ease-out
                group-hover/search:left-[200%]
              "
            />
          </span>

          <HeroSearch keywords={keywords} dark />
        </div>
      </div>

      {/* === 数据指标 === */}
      <div
        ref={metricRowRef}
        className="mt-20 flex items-center justify-center gap-x-10 gap-y-4 flex-wrap"
      >
        <Metric value="4" label="平台聚合" accent="#6E8CFF" active={metricInView} />
        <GlowDivider />
        <Metric value="30" label="热点更新(分)" accent="#A855F7" active={metricInView} />
        <GlowDivider />
        <Metric value="4" label="一键改稿" accent="#EC4899" active={metricInView} />
        <GlowDivider />
        <Metric value="MD" label="导出格式" accent="#38BDF8" active={metricInView} />
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  accent,
  active,
}: {
  value: string;
  label: string;
  accent: string;
  active: boolean;
}) {
  return (
    <div className="flex flex-col items-center min-w-[80px]">
      <div
        className="font-serif text-2xl mb-1 tabular-nums"
        style={{
          color: accent,
          textShadow: `0 0 20px ${accent}66`,
        }}
      >
        <MetricCountUp value={value} active={active} />
      </div>
      <div className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-medium">
        {label}
      </div>
    </div>
  );
}

function GlowDivider() {
  return (
    <div
      className="w-px h-10"
      style={{
        background:
          "linear-gradient(180deg, transparent, rgba(255,255,255,0.15), transparent)",
      }}
      aria-hidden
    />
  );
}