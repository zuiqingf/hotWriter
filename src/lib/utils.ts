/**
 * 通用工具函数
 */

import { randomUUID } from "crypto";

export function generateUuid(): string {
  return randomUUID();
}

const API_BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * 给手写的 fetch URL 自动加 basePath 前缀。
 * 仅在浏览器端用;server 端无需调用。
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  return API_BASE + path;
}

/**
 * 估算文本 token 数（粗略估算）
 * 实际应使用 tokenizer，但简单场景够用
 */
export function estimateTokens(text: string): number {
  // 中文约 1.5 字符/token，英文约 4 字符/token
  // 取平均 ~3 字符/token 做估算
  return Math.ceil(text.length / 3);
}

/**
 * 统计字数（中英文混合）
 */
export function countWords(text: string): number {
  if (!text) return 0;
  // 中文按字符数，英文按单词数
  const chineseChars = (text.match(/[一-龥]/g) || []).length;
  const englishWords = (text.match(/\b[a-zA-Z]+\b/g) || []).length;
  return chineseChars + englishWords;
}

/**
 * 截断文本
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * 时间格式化（中文）
 * @param date 时间戳（秒）或 Date 对象；undefined/null 返回空字符串
 */
export function formatTimeAgo(date: Date | number | null | undefined): string {
  if (date == null) return "";
  let d: Date;
  if (typeof date === "number") {
    // NaN 防御
    if (!Number.isFinite(date)) return "";
    d = new Date(date * 1000);
  } else {
    d = date;
  }
  // 无效 Date 防御
  if (isNaN(d.getTime())) return "";

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 0) return "刚刚"; // 防御未来时间
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} 天前`;
  return d.toLocaleDateString("zh-CN");
}
