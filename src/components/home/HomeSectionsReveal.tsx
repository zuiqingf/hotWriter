"use client";

import { useRef } from "react";
import { HomeAnimations } from "@/components/home/HomeAnimations";

/**
 * HomeSectionsReveal —— 给下方"热榜 / 上手提示 / 最近文章"等 section
 * 套一层 scroll-triggered 淡入动画。
 *
 * 用法：把要触发淡入的 section 包在 children 即可，第一个直接子节点
 * 会被作为 IntersectionObserver root。
 */
export function HomeSectionsReveal({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // 占位 refs：HomeAnimations 必须接收这些 prop，给 dummy ref 即可
  const dummy = useRef<HTMLElement>(null);

  return (
    <div ref={rootRef}>
      {/* 仅占位用，不实际动画 */}
      <HomeAnimations
        titleLine1Ref={dummy}
        titleLine2Ref={dummy}
        subtitleRef={dummy}
        searchRef={dummy}
        metricRowRef={dummy}
        sectionsRef={rootRef}
      />
      {children}
    </div>
  );
}
