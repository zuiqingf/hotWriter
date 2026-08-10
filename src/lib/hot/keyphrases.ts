/**
 * 从热榜数据中提炼可作为搜索词的"热门话题"
 *
 * 目标：从四平台热榜标题里抽出适合作为"文章主题"的关键短语
 *
 * 规则：
 * - 优先选「话题型」标题（5-20 字、有信息密度的）
 * - 过滤掉：纯 emoji、个人感叹、过长标题、含特殊符号
 * - 去重：跨平台同主题合并
 * - 最多返回 N 个
 */

import type { HotTopicsData, HotItem } from "@/lib/hot/fetcher";

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F100}-\u{1F1FF}]/gu;

const NOISE_REGEX =
  /[【】\[\](){}「」『』〈〉《》]|^\d+$|^https?:|^\s*\?\s*$/;

/** 标题质量评分（越高越适合做搜索词） */
function scoreTitle(title: string): number {
  const len = title.length;
  if (len < 4 || len > 30) return 0;
  let score = 50;

  // 长度甜区
  if (len >= 6 && len <= 18) score += 20;
  if (len >= 8 && len <= 14) score += 10;

  // 去掉 emoji 和噪声后的纯文本比例
  const cleaned = title.replace(EMOJI_REGEX, "").trim();
  if (cleaned.length / title.length < 0.6) return 0;

  // 含数字加分（如"2026"、"TOP30"暗示有时效性）
  if (/\d/.test(title)) score += 5;

  // 含媒体/事件关键词加分
  const keywords = ["发布", "上线", "新规", "公布", "数据", "出炉", "排行", "首", "突破", "增长", "下跌"];
  if (keywords.some((k) => title.includes(k))) score += 10;

  // 感叹/口语结尾扣分（更适合做话题词的偏中性标题分数更高）
  if (/[！!呀啊嘛呢哦哈耶]+$/.test(cleaned)) score -= 10;

  // 含问号扣分（更适合陈述句）
  if (title.includes("?") || title.includes("？")) score -= 15;

  return score;
}

/** 简化：清理 emoji 与多余符号 */
export function cleanForSearch(title: string): string {
  return title
    .replace(EMOJI_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 提炼出的关键词 + 其原文 URL（来自热榜项；历史/兜底项 url 为空） */
export interface ExtractedKeyword {
  keyword: string;
  /** 原文 URL（如 baijiahao / thepaper 等）。agent 拿到后会先 fetch_url 避免幻觉 */
  url: string;
}

export function extractKeywords(
  data: HotTopicsData,
  options: {
    max?: number;
    fallback?: string[];
    /** 来自用户历史研究的关键词，优先展示 */
    historyKeywords?: string[];
  } = {}
): ExtractedKeyword[] {
  const { max = 6, fallback = ["副业做博主靠谱吗"], historyKeywords = [] } = options;

  // ============ Step 1: 收集热榜候选（保留 url） ============
  const all: Array<{ title: string; url: string; score: number; platform: string }> = [];

  for (const platform of ["thepaper", "toutiao", "baidu", "douyin"] as const) {
    const list = data[platform]?.items ?? [];
    for (const item of list) {
      if (item.title.startsWith("示例") || item.title.startsWith("占位")) continue;
      const score = scoreTitle(item.title);
      if (score > 0) {
        all.push({ title: item.title, url: item.url, score, platform });
      }
    }
  }

  all.sort((a, b) => b.score - a.score);

  // ============ Step 2: 热榜候选去重（按 cleaned 标题） ============
  const candidates: ExtractedKeyword[] = [];
  const seenCleaned = new Set<string>();
  for (const item of all) {
    const cleaned = cleanForSearch(item.title);
    if (cleaned.length < 4) continue;
    if (seenCleaned.has(cleaned)) continue;
    seenCleaned.add(cleaned);
    candidates.push({ keyword: cleaned, url: item.url });
  }

  // ============ Step 3: 混排「历史优先 + 热榜补足」 ============
  const result: ExtractedKeyword[] = [];
  const seen = new Set<string>();

  // 3a. 先把历史关键词塞进去（按数组顺序，由调用方保证是按最近使用排）
  // 历史词没有 url（以前没存），url 留空 → agent 不会触发 fetch_url 指令
  const historyQuota = Math.max(1, Math.ceil(max * 0.6));

  for (const kw of historyKeywords) {
    const cleaned = cleanForSearch(kw);
    if (cleaned.length < 2) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push({ keyword: cleaned, url: "" });
    if (result.length >= historyQuota) break;
  }

  // 3b. 用热榜里「不在历史」的词补到 max
  for (const cand of candidates) {
    if (result.length >= max) break;
    if (seen.has(cand.keyword)) continue;
    seen.add(cand.keyword);
    result.push(cand);
  }

  // 3c. 兜底
  if (result.length < 3) {
    for (const f of fallback) {
      if (result.length >= max) break;
      if (seen.has(f)) continue;
      seen.add(f);
      result.push({ keyword: f, url: "" });
    }
  }

  return result.slice(0, max);
}
