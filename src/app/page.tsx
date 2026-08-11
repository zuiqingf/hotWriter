import { HeroSearch } from "@/components/home/HeroSearch";
import { HotList } from "@/components/home/HotList";
import Link from "next/link";
import { db, formatTimeAgo } from "@/lib/db";
import { fetchAllHotTopics, type HotTopicsData } from "@/lib/hot/fetcher";
import { extractKeywords } from "@/lib/hot/keyphrases";

// 30 分钟重新拉取热榜
export const revalidate = 1800;

// 默认空数据（数据获取失败时兜底）
const EMPTY_HOT: HotTopicsData = {
  thepaper: { ok: false, items: [], source: "fallback", error: "获取失败" },
  toutiao: { ok: false, items: [], source: "fallback", error: "获取失败" },
  baidu: { ok: false, items: [], source: "fallback", error: "获取失败" },
  douyin: { ok: false, items: [], source: "fallback", error: "获取失败" },
  fetchedAt: 0,
};

export default async function HomePage() {
  // ========== 并行：拉热点 + 拉最近文章 ==========
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

  // 从 research_sessions 提取历史搜索关键词（按最近时间）
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
  } catch {
    // 数据库初始化前/出错时，安静退化
  }

  // 混排：历史优先 + 热榜里没写过的新词补足
  const heroKeywords = extractKeywords(hot, {
    max: 6,
    historyKeywords,
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <HeroSearch keywords={heroKeywords} />

      {/* 四大平台热搜 */}
      <HotList initialData={hot} />

      {/* 上手提示 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm">
        <div className="font-medium text-amber-900 mb-1">⚙️ 上手提示</div>
        <ol className="text-amber-800 space-y-1 text-xs list-decimal list-inside">
          <li>确保 <code className="bg-white px-1.5 py-0.5 rounded">.env</code> 中 <code>DEEPSEEK_API_KEY</code> 已配置（必填）</li>
          <li>可选：<code>TAVILY_API_KEY</code> 启用 Web 搜索（无 key 也行，会降级到 LLM 自有知识）</li>
          <li>首次运行前请执行 <code className="bg-white px-1.5 py-0.5 rounded">npm run db:migrate</code></li>
        </ol>
      </div>

      {/* 最近文章 */}
      {recentArticles.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">📝 最近的文章</h2>
            <Link href="/library" className="text-xs text-brand-600 hover:underline">
              查看全部 →
            </Link>
          </div>
          <div className="space-y-2">
            {recentArticles.map((a) => (
              <Link
                key={a.id}
                href={`/write/${a.id}`}
                className="block bg-white border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
              >
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {a.word_count || 0} 字 · {a.style || "未指定风格"} ·{" "}
                  {formatTimeAgo(a.updated_at)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentArticles.length === 0 && (
        <section className="text-center py-12 text-gray-400 text-sm">
          <div className="text-4xl mb-3">📝</div>
          <div>还没有文章，输入关键词开始你的第一篇</div>
        </section>
      )}
    </div>
  );
}

// 用 try/catch 包一层，避免冷启动时 DB 报错炸掉整个页面
async function safeQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn("查询失败（首次运行数据库可能未初始化）:", err);
    return [] as any;
  }
}
