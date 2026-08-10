import Link from "next/link";
import { db, formatTimeAgo } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  let allArticles: any[] = [];
  try {
    allArticles = db.all(
      "SELECT * FROM articles WHERE status != 'deleted' ORDER BY updated_at DESC"
    );
  } catch (err) {
    console.warn("读取文章失败:", err);
  }

  const drafts = allArticles.filter((a) => a.status === "draft");
  const archived = allArticles.filter((a) => a.status === "archived");

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">📚 我的作品库</h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {allArticles.length} 篇 · 草稿 {drafts.length} · 已归档 {archived.length}
          </p>
        </div>
        <Link href="/" className="btn-primary">
          + 新建
        </Link>
      </div>

      {drafts.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">📝 草稿</h2>
          <div className="card divide-y divide-gray-100">
            {drafts.map((a) => (
              <Link key={a.id} href={`/write/${a.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0">📝</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium truncate">{a.title}</h3>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">草稿</span>
                      {a.style && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{a.style}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {a.source_type === "keyword" && a.source_ref
                        ? `关键词「${a.source_ref}」`
                        : a.source_type === "hot"
                        ? "热点"
                        : "手写"}{" "}
                      · {a.word_count || 0} 字 · {formatTimeAgo(a.updated_at)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">✅ 已归档</h2>
          <div className="card divide-y divide-gray-100">
            {archived.map((a) => (
              <Link key={a.id} href={`/write/${a.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0">✅</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{a.title}</h3>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">已归档</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {a.word_count || 0} 字 · {formatTimeAgo(a.updated_at)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {allArticles.length === 0 && (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-3">📝</div>
          <h3 className="text-lg font-medium mb-2">还没有文章</h3>
          <p className="text-sm text-gray-500 mb-4">
            在首页输入主题，让 Agent 帮你调研 + 写作
          </p>
          <Link href="/" className="btn-primary">
            开始写第一篇
          </Link>
        </div>
      )}
    </div>
  );
}
