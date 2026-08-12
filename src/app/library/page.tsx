import Link from "next/link";
import { db, formatTimeAgo } from "@/lib/db";
import { StyleTabs } from "@/components/library/StyleTabs";
import { Pagination } from "@/components/library/Pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

/** 把 HTML 截成纯文本预览（去标签） */
function stripHtml(html: string | null, max = 100): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

interface PageProps {
  searchParams: { style?: string; page?: string };
}

export default async function LibraryPage({ searchParams }: PageProps) {
  // ============ 入参 ============
  const currentStyle = searchParams.style?.trim() || "all";
  const currentPage = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // ============ 并发：风格统计 + 当前页数据 ============
  let allStyles: { style: string; cnt: number }[] = [];
  let articles: any[] = [];
  let totalForStyle = 0;

  try {
    const styleRows = await db.all<{ style: string; cnt: number }>(
      `SELECT COALESCE(NULLIF(style, ''), '未分类') AS style, COUNT(*) AS cnt
       FROM articles
       WHERE status != 'deleted'
       GROUP BY style
       ORDER BY cnt DESC`
    );
    allStyles = styleRows;

    const countRow = await db.get<{ cnt: number }>(
      currentStyle === "all"
        ? "SELECT COUNT(*) AS cnt FROM articles WHERE status != 'deleted'"
        : `SELECT COUNT(*) AS cnt FROM articles
           WHERE status != 'deleted'
             AND COALESCE(NULLIF(style, ''), '未分类') = ?`,
      currentStyle === "all" ? [] : [currentStyle]
    );
    totalForStyle = Number(countRow?.cnt ?? 0);

    articles = await db.all(
      currentStyle === "all"
        ? `SELECT id, uuid, title, content, style, source_type, source_ref,
                 word_count, status, created_at, updated_at
           FROM articles
           WHERE status != 'deleted'
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`
        : `SELECT id, uuid, title, content, style, source_type, source_ref,
                 word_count, status, created_at, updated_at
           FROM articles
           WHERE status != 'deleted'
             AND COALESCE(NULLIF(style, ''), '未分类') = ?
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`,
      currentStyle === "all"
        ? [PAGE_SIZE, offset]
        : [currentStyle, PAGE_SIZE, offset]
    );
  } catch (err) {
    console.warn("读取作品库失败:", err);
  }

  const totalPages = Math.max(1, Math.ceil(totalForStyle / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white scrollbar-hide">
      {/* 暗底柔和渐变光晕（区别于首页的强 Aurora，这里克制一点） */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 80% -10%, rgba(168, 85, 247, 0.18) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 0% 100%, rgba(44, 91, 255, 0.14) 0%, transparent 60%)
          `,
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl text-white flex items-center gap-2.5">
            <span
              className="inline-block w-1.5 h-7 rounded-full"
              style={{
                background: "linear-gradient(180deg, #6E8CFF 0%, #A855F7 100%)",
                boxShadow: "0 0 12px rgba(168,85,247,0.6)",
              }}
            />
            📚 我的作品库
          </h1>
          <p className="text-sm text-white/50 mt-2">
            共 {totalForStyle} 篇 · 第 {currentPage} / {totalPages} 页
          </p>
        </div>
        <Link
          href="/"
          className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-all duration-300 hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, #2C5BFF 0%, #A855F7 100%)",
            boxShadow: "0 4px 16px -4px rgba(168,85,247,0.5)",
          }}
        >
          + 新建
        </Link>
      </div>

      {/* 风格分类 Tab */}
      <StyleTabs allStyles={allStyles} current={currentStyle} />

      {/* 卡片网格 */}
      {articles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {articles.map((a) => {
            const isArchived = a.status === "archived";
            const preview = stripHtml(a.content, 100);
            return (
              <Link
                key={a.id}
                href={`/write/${a.id}`}
                className="group relative p-5 rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_-15px_rgba(168,85,247,0.4)]"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                {/* hover 左侧渐变条 */}
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 bg-gradient-to-b from-accent-400 to-purple-500 rounded-r transition-all duration-300 group-hover:h-12"
                  style={{ boxShadow: "0 0 10px rgba(110,140,255,0.7)" }}
                  aria-hidden
                />

                {/* 顶部：图标 + 标题 */}
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg shrink-0">{isArchived ? "✅" : "📝"}</span>
                  <h3
                    className={`font-medium leading-snug line-clamp-2 transition ${
                      isArchived ? "text-white/50" : "text-white group-hover:text-accent-300"
                    }`}
                    title={a.title}
                  >
                    {a.title}
                  </h3>
                </div>

                {/* 预览 */}
                <p className="text-xs text-white/50 line-clamp-3 leading-relaxed mb-4 min-h-[3.6em]">
                  {preview || "（暂无正文）"}
                </p>

                {/* 底部元信息 */}
                <div className="mt-auto flex items-center gap-2 flex-wrap text-xs">
                  {a.style && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-400/20">
                      {a.style}
                    </span>
                  )}
                  {isArchived && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                      已归档
                    </span>
                  )}
                  <span className="text-white/40 ml-auto tabular-nums">
                    {a.word_count || 0} 字
                  </span>
                  <span className="text-white/40 tabular-nums">
                    {formatTimeAgo(a.updated_at)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-xl p-12 text-center mt-6"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="text-5xl mb-3">📝</div>
          <h3 className="text-lg font-medium mb-2 text-white">
            {currentStyle === "all" ? "还没有文章" : `还没有「${currentStyle}」风格的文章`}
          </h3>
          <p className="text-sm text-white/50 mb-4">
            在首页输入主题，让 Agent 帮你调研 + 写作
          </p>
          <Link
            href="/"
            className="inline-block text-sm px-4 py-2 rounded-lg font-medium text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #2C5BFF 0%, #A855F7 100%)",
              boxShadow: "0 4px 16px -4px rgba(168,85,247,0.5)",
            }}
          >
            开始写第一篇
          </Link>
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-10">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            currentStyle={currentStyle}
          />
        </div>
      )}
    </div>
    </div>
  );
}