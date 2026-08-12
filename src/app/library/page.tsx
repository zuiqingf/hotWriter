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
    // 各风格的文章数（用于 tab 角标）
    const styleRows = await db.all<{ style: string; cnt: number }>(
      `SELECT COALESCE(NULLIF(style, ''), '未分类') AS style, COUNT(*) AS cnt
       FROM articles
       WHERE status != 'deleted'
       GROUP BY style
       ORDER BY cnt DESC`
    );
    allStyles = styleRows;

    // 当前 style 的总数
    const countRow = await db.get<{ cnt: number }>(
      currentStyle === "all"
        ? "SELECT COUNT(*) AS cnt FROM articles WHERE status != 'deleted'"
        : `SELECT COUNT(*) AS cnt FROM articles
           WHERE status != 'deleted'
             AND COALESCE(NULLIF(style, ''), '未分类') = ?`,
      currentStyle === "all" ? [] : [currentStyle]
    );
    totalForStyle = Number(countRow?.cnt ?? 0);

    // 当前页数据
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
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">📚 我的作品库</h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {totalForStyle} 篇 · 第 {currentPage} / {totalPages} 页
          </p>
        </div>
        <Link href="/" className="btn-primary">
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
                className="card p-5 hover:border-brand-300 hover:shadow-md transition group flex flex-col"
              >
                {/* 顶部：图标 + 标题 */}
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg shrink-0">{isArchived ? "✅" : "📝"}</span>
                  <h3
                    className={`font-medium leading-snug line-clamp-2 group-hover:text-brand-600 transition ${
                      isArchived ? "text-gray-500" : "text-gray-900"
                    }`}
                    title={a.title}
                  >
                    {a.title}
                  </h3>
                </div>

                {/* 预览 */}
                <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed mb-4 min-h-[3.6em]">
                  {preview || "（暂无正文）"}
                </p>

                {/* 底部元信息 */}
                <div className="mt-auto flex items-center gap-2 flex-wrap text-xs">
                  {a.style && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                      {a.style}
                    </span>
                  )}
                  {isArchived && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      已归档
                    </span>
                  )}
                  <span className="text-gray-400 ml-auto tabular-nums">
                    {a.word_count || 0} 字
                  </span>
                  <span className="text-gray-400 tabular-nums">
                    {formatTimeAgo(a.updated_at)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card p-12 text-center mt-6">
          <div className="text-5xl mb-3">📝</div>
          <h3 className="text-lg font-medium mb-2">
            {currentStyle === "all" ? "还没有文章" : `还没有「${currentStyle}」风格的文章`}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            在首页输入主题，让 Agent 帮你调研 + 写作
          </p>
          <Link href="/" className="btn-primary">
            开始写第一篇
          </Link>
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            currentStyle={currentStyle}
          />
        </div>
      )}
    </div>
  );
}
