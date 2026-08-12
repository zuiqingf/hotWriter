"use client";

import { useEffect, useState } from "react";

/**
 * useTypewriter —— 字符级"打字机"动效 hook
 *
 * - 组件挂载后等 startDelay 毫秒，逐字累加 n
 * - 每字符 charDelay 毫秒
 * - 把 `trigger` 放进 deps —— 当 trigger 从 false→true（链式阶段推进），
 *   effect 会重跑、重置 n=0、再开始打字
 *
 * ⚠️ 不要在 effect 里加 `startedRef` 之类的"只跑一次"守卫——
 *    React 18 strict mode 下 effect 会跑两次，守卫会把第二次拦下，导致永远不开始。
 */
export function useTypewriter(
  text: string,
  startDelay: number,
  charDelay = 40,
  trigger: unknown = true
): string {
  const [n, setN] = useState(0);

  useEffect(() => {
    setN(0); // 阶段推进时归零
    const timers: ReturnType<typeof setTimeout>[] = [];

    const startTimer = setTimeout(() => {
      for (let i = 1; i <= text.length; i++) {
        timers.push(
          setTimeout(() => {
            setN(i);
          }, (i - 1) * charDelay)
        );
      }
    }, startDelay);

    return () => {
      clearTimeout(startTimer);
      timers.forEach(clearTimeout);
    };
  }, [text, startDelay, charDelay, trigger]);

  return text.slice(0, n);
}

/**
 * Cursor —— 打字机末尾闪烁光标
 * 放在 typewriter 输出文本后面即可
 */
export function Cursor({ visible = true }: { visible?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block w-[2px] h-[0.9em] align-baseline ml-1"
      style={{
        background: "linear-gradient(180deg, #6E8CFF, #A855F7)",
        boxShadow: "0 0 8px rgba(168,85,247,0.7)",
        animation: visible ? "tw-cursor-blink 1s steps(2) infinite" : "none",
        opacity: visible ? 1 : 0,
      }}
    />
  );
}