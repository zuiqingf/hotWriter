/**
 * Markdown ↔ HTML 转换
 *
 * 用于：
 * - 老文章 DB 里存的是 MD，加载时要转 HTML 给 Tiptap
 * - Tiptap 输出 HTML，自动保存时如果想保留 MD 格式可转回 MD
 *   （当前策略：直接存 HTML，简单粗暴，旧的 MD 内容会被改写成 HTML）
 *
 * 启发式判断"是否 HTML"：以 `<` 开头 + 含 `</` 才算 HTML；否则当 MD。
 */

import { marked } from "marked";

marked.setOptions({
  gfm: true,       // GitHub 风格（表格、删除线、任务列表）
  breaks: false,   // 不把单个换行转成 <br>，符合标准 MD
});

/** MD → HTML（不做消毒，让 Tiptap 自己处理） */
export function mdToHtml(md: string): string {
  if (!md) return "";
  return marked.parse(md, { async: false }) as string;
}

/** HTML → MD（备用；当前自动保存存 HTML 不调这个） */
export function htmlToMd(html: string): string {
  // 简单实现：剥离常见标签，正文保留
  // 用 DOMParser 在浏览器跑最准，Node 端没有
  if (!html) return "";
  return html
    .replace(/<\/?(p|div)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, "\n```\n$1\n```\n")
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, c) =>
      c.split("\n").map((l: string) => "> " + l).join("\n")
    )
    .replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 启发式：内容看起来像 HTML 吗？ */
export function looksLikeHtml(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  // 必须以 < 开头，且含至少一个 </...> 闭合
  return trimmed.startsWith("<") && /<\/[a-z][\w-]*>/i.test(trimmed);
}

/** 智能解析：内容可能是 HTML 也可能是 MD，统一转成 HTML 给 Tiptap */
export function normalizeToHtml(content: string): string {
  if (!content) return "";
  return looksLikeHtml(content) ? content : mdToHtml(content);
}

/**
 * 把 HTML 转成纯文本（给 LLM 喂正文用，节省 token）
 *
 * 实现：删 <style>/<script> → 标签替换成换行 → 解码常见 HTML entity → 折叠多换行
 * 不引入 DOMParser，因为 Node 端没有；server / client 都能跑。
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}