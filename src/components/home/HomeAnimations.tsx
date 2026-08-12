"use client";

import { useEffect, useRef, useState } from "react";

/* =============================================================
 * HomeAnimations
 * 首页所有的"炫酷"动画效果集中在这一个 client 组件里。
 * 通过 useRef 把动画效果附加到对应 DOM 上（不动 server 组件 JSX）。
 * ============================================================= */
export function HomeAnimations({
  titleLine1Ref,
  titleLine2Ref,
  subtitleRef,
  searchRef,
  metricRowRef,
  sectionsRef,
}: {
  /** Hero 主标题第 1 行 */
  titleLine1Ref: React.RefObject<HTMLElement>;
  /** Hero 主标题第 2 行（"到一篇文章"渐变行） */
  titleLine2Ref: React.RefObject<HTMLElement>;
  /** Hero 副标题 */
  subtitleRef: React.RefObject<HTMLElement>;
  /** Hero 搜索框外壳 */
  searchRef: React.RefObject<HTMLElement>;
  /** Metric 行 */
  metricRowRef: React.RefObject<HTMLElement>;
  /** 所有要 scroll 触发的 section 容器 */
  sectionsRef: React.RefObject<HTMLElement>;
}) {
  /* ---------- 1. Hero 进场动画（页面打开） ---------- */
  useEffect(() => {
    const items = [
      { el: titleLine1Ref.current, delay: 0 },
      { el: titleLine2Ref.current, delay: 120 },
      { el: subtitleRef.current, delay: 260 },
      { el: searchRef.current, delay: 380 },
      { el: metricRowRef.current, delay: 520 },
    ];
    // 初始隐藏 + 上移 16px
    items.forEach(({ el }) => {
      if (!el) return;
      el.style.opacity = "0";
      el.style.transform = "translateY(16px)";
      el.style.transition =
        "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1), transform 700ms cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.willChange = "opacity, transform";
    });
    // 触发动画
    const timers = items.map(({ el, delay }) =>
      setTimeout(() => {
        if (!el) return;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, delay + 100) // +100ms 让浏览器 paint 完成初始隐藏
    );
    return () => timers.forEach(clearTimeout);
  }, [titleLine1Ref, titleLine2Ref, subtitleRef, searchRef, metricRowRef]);

  /* ---------- 2. Hero 鼠标跟随渐变 ---------- */
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const onMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      hero.style.setProperty("--mouse-x", `${x}%`);
      hero.style.setProperty("--mouse-y", `${y}%`);
    };
    hero.addEventListener("mousemove", onMove);
    return () => hero.removeEventListener("mousemove", onMove);
  }, []);

  /* ---------- 3. Scroll 触发的 section 淡入 ---------- */
  useEffect(() => {
    const root = sectionsRef.current;
    if (!root) return;
    const children = Array.from(root.children) as HTMLElement[];
    children.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(24px)";
      el.style.transition =
        "opacity 800ms cubic-bezier(0.16, 1, 0.3, 1), transform 800ms cubic-bezier(0.16, 1, 0.3, 1)";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -80px 0px" }
    );
    children.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sectionsRef]);

  // 渲染一个不可见的"鼠标光晕"覆盖层（挂在 hero 上层，鼠标移过时光斑跟随）
  return (
    <div
      ref={heroRef}
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(168,85,247,0.12) 0%, rgba(44,91,255,0.06) 30%, transparent 60%)",
        transition: "background 200ms ease-out",
        zIndex: 1,
      }}
    />
  );
}

/* =============================================================
 * AuroraOrbs —— 浮动光斑
 * ============================================================= */
export function AuroraOrbs() {
  return (
    <>
      <div
        className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)",
          filter: "blur(80px)",
          animation: "orb-drift-1 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute top-20 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(168, 85, 247, 0.35) 0%, transparent 70%)",
          filter: "blur(100px)",
          animation: "orb-drift-2 22s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-0 left-1/3 w-[450px] h-[450px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(56, 189, 248, 0.20) 0%, transparent 70%)",
          filter: "blur(90px)",
          animation: "orb-drift-3 26s ease-in-out infinite",
        }}
      />
    </>
  );
}

/* =============================================================
 * HeroGridLines —— 极淡网格 + 慢速视差
 * ============================================================= */
export function HeroGridLines() {
  return (
    <div
      className="absolute inset-0 opacity-[0.06] pointer-events-none"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        maskImage:
          "radial-gradient(ellipse 60% 80% at 50% 30%, black 0%, transparent 70%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 60% 80% at 50% 30%, black 0%, transparent 70%)",
        animation: "grid-drift 40s linear infinite",
      }}
    />
  );
}

/* =============================================================
 * MetricCountUp —— 数字滚动动画
 * ============================================================= */
export function MetricCountUp({
  value,
  duration = 1200,
  active,
}: {
  value: string;
  /** 触发后才开始（用于 scroll-triggered） */
  active: boolean;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;

    // 解析数字与文字前缀
    const match = value.match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
    if (!match) {
      setDisplay(value);
      return;
    }
    const [, prefix, numStr, suffix] = match;
    const target = parseFloat(numStr);
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // ease-out-expo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const current = target * eased;
      // 整数 / 小数处理
      const formatted = Number.isInteger(target)
        ? Math.round(current).toString()
        : current.toFixed(1);
      setDisplay(`${prefix}${formatted}${suffix}`);
      if (t < 1) requestAnimationFrame(tick);
      else setDisplay(value); // 最终值恢复原始字符串（含原始空格等）
    };
    requestAnimationFrame(tick);
  }, [active, value, duration]);

  return <>{display}</>;
}

/* =============================================================
 * useInView —— 简单的"是否进入视口"hook
 * ============================================================= */
export function useInView<T extends Element>(
  ref: React.RefObject<T>,
  options: IntersectionObserverInit = { threshold: 0.2 }
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      options
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, options]);
  return inView;
}