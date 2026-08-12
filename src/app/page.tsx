import { HotList } from "@/components/home/HotList";
import Link from "next/link";
import { db, formatTimeAgo } from "@/lib/db";
import { fetchAllHotTopics, type HotTopicsData } from "@/lib/hot/fetcher";
import { extractKeywords } from "@/lib/hot/keyphrases";
import { HeroSection } from "@/components/home/HeroSection";
import { AuroraOrbs } from "@/components/home/HomeAnimations";
import { HeroGridLines } from "@/components/home/HomeAnimations";
import { HomeSectionsReveal } from "@/components/home/HomeSectionsReveal";

export const revalidate = 1800;

const EMPTY_HOT: HotTopicsData = {
  thepaper: { ok: false, items: [], source: "fallback", error: "获取失败" },
  toutiao: { ok: false, items: [], source: "fallback", error: "获取失败" },
  baidu: { ok: false, items: [], source: "fallback", error: "获取失败" },
  douyin: { ok: false, items: [], source: "fallback", error: "获取失败" },
  fetchedAt: 0,
};

export default async function HomePage() {
  const [hotResult, articlesResult] = await Promise.allSettled([
    fetchAllHotTopics().catch(() => EMPTY_HOT),
    safeQuery(() =>
      db.all(
        "SELECT * FROM articles WHERE status IN ('draft','archived') ORDER BY updated_at DESC LIMIT 5"
      )
    ),
  ]);

  const hot: HotTopicsData = hotResult.status === "fulfilled" ? hotResult.value : EMPTY_HOT;
  const recentArticles: any[] =
    articlesResult.status === "fulfilled" ? articlesResult.value : [];

  let historyKeywords: string[] = [];
  try {
    const rows = await db.all<{ keyword: string; last_used: number }>(
      `SELECT keyword, MAX(created_at) as last_used
       FROM research_sessions
       GROUP BY keyword
       ORDER BY last_used DESC
       LIMIT 10`
    );
    historyKeywords = rows.map((r) => r.keyword);
  } catch {}

  const heroKeywords = extractKeywords(hot, {
    max: 6,
    historyKeywords,
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white scrollbar-hide">
      {/* ============================================================
          HERO 区：Aurora 极光背景 + 几何光斑 + 巨型发光球体
         ============================================================ */}
      <section className="relative overflow-hidden">
        {/* === Aurora 层 1：径向渐变背景（静态柔和） === */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 20% 30%, rgba(44, 91, 255, 0.35) 0%, transparent 60%),
              radial-gradient(ellipse 50% 60% at 80% 20%, rgba(168, 85, 247, 0.30) 0%, transparent 55%),
              radial-gradient(ellipse 70% 50% at 50% 80%, rgba(56, 189, 248, 0.20) 0%, transparent 60%)
            `,
          }}
        />

        {/* === Aurora 层 2：浮动光斑（动画版） === */}
        <AuroraOrbs />

        {/* === Aurora 层 3：噪点纹理（去塑料感） === */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* === 顶部细网格（视差漂移版） === */}
        <HeroGridLines />

        {/* === Hero 内容（client，含进场动画 + 鼠标光晕 + count-up） === */}
        <HeroSection keywords={heroKeywords} />
      </section>

      {/* ============================================================
          主体区：scroll-triggered 淡入
         ============================================================ */}
      <HomeSectionsReveal>
        <div className="bg-[#0a0a0f]">
          {/* === 热榜区 === */}
          <section className="max-w-5xl mx-auto px-6 pt-8 pb-20">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="font-serif text-3xl text-white flex items-center gap-2">
                  <span
                    className="inline-block w-1.5 h-6 rounded-full"
                    style={{
                      background:
                        "linear-gradient(180deg, #6E8CFF 0%, #A855F7 100%)",
                      boxShadow: "0 0 12px rgba(168,85,247,0.6)",
                      animation: "glow-pulse 3s ease-in-out infinite",
                    }}
                  />
                  全网热点
                </h2>
                <p className="text-xs text-white/40 mt-2">
                  实时聚合澎湃、头条、百度、抖音四大平台热门话题
                </p>
              </div>
            </div>
            <HotList initialData={hot} />
          </section>

          {/* === 上手提示（玻璃卡） === */}
          <section className="max-w-5xl mx-auto px-6 pb-16">
            <div
              className="rounded-xl p-6 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.05]"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(110,140,255,0.2), rgba(168,85,247,0.2))",
                    border: "1px solid rgba(168,85,247,0.3)",
                  }}
                >
                  ⚙
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white mb-2">
                    首次使用 · 三步即可
                  </div>
                  <div className="text-xs text-white/50 space-y-1.5">
                    <Step n={1}>
                      配置{" "}
                      <code className="text-accent-300 bg-white/5 px-1.5 py-0.5 rounded font-mono text-[11px] border border-white/10">
                        DEEPSEEK_API_KEY
                      </code>
                      （必填）
                    </Step>
                    <Step n={2}>
                      可选{" "}
                      <code className="text-accent-300 bg-white/5 px-1.5 py-0.5 rounded font-mono text-[11px] border border-white/10">
                        TAVILY_API_KEY
                      </code>{" "}
                      启用联网搜索
                    </Step>
                    <Step n={3}>
                      执行{" "}
                      <code className="text-accent-300 bg-white/5 px-1.5 py-0.5 rounded font-mono text-[11px] border border-white/10">
                        npm run db:migrate
                      </code>{" "}
                      初始化数据库
                    </Step>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* === 最近文章 === */}
          {recentArticles.length > 0 ? (
            <section className="max-w-5xl mx-auto px-6 pb-24">
              <div className="flex items-end justify-between mb-6">
                <h2 className="font-serif text-3xl text-white flex items-center gap-2">
                  <span
                    className="inline-block w-1.5 h-6 rounded-full"
                    style={{
                      background:
                        "linear-gradient(180deg, #6E8CFF 0%, #A855F7 100%)",
                      boxShadow: "0 0 12px rgba(168,85,247,0.6)",
                      animation: "glow-pulse 3s ease-in-out infinite",
                    }}
                  />
                  你的文章
                </h2>
                <Link
                  href="/library"
                  className="text-xs text-white/40 hover:text-white transition"
                >
                  查看全部 →
                </Link>
              </div>
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {recentArticles.map((a) => (
                  <Link
                    key={a.id}
                    href={`/write/${a.id}`}
                    className="group relative flex items-center justify-between px-5 py-4 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] transition"
                  >
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 bg-gradient-to-b from-accent-400 to-purple-500 rounded-r transition-all group-hover:h-10"
                      style={{ boxShadow: "0 0 8px rgba(110,140,255,0.6)" }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium text-white truncate group-hover:text-white transition">
                        {a.title}
                      </div>
                      <div className="text-xs text-white/40 mt-1.5 flex items-center gap-2.5">
                        <span className="tabular-nums">{a.word_count || 0} 字</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span>{a.style || "未指定风格"}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span>{formatTimeAgo(a.updated_at)}</span>
                      </div>
                    </div>
                    <span className="ml-4 text-white/30 group-hover:text-accent-300 group-hover:translate-x-1 transition-all">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <section className="max-w-5xl mx-auto px-6 pb-24 text-center py-16">
              <div className="text-white/30 text-sm">
                <div className="text-2xl mb-3">📝</div>
                <div>还没有文章，输入关键词开始你的第一篇</div>
              </div>
            </section>
          )}
        </div>
      </HomeSectionsReveal>
    </div>
  );
}

/* ========== 子组件 ========== */

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-semibold tabular-nums shrink-0"
        style={{
          background: "linear-gradient(135deg, #6E8CFF, #A855F7)",
          color: "white",
        }}
      >
        {n}
      </span>
      <span>{children}</span>
    </div>
  );
}

async function safeQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn("查询失败:", err);
    return [] as any;
  }
}
