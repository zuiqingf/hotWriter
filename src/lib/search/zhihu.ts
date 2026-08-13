/**
 * 平台站内搜索（v0.1 占位实现 — 全部走 Tavily + site: 限定符）
 *
 * 注意：
 * - 知乎 / 小红书 / 百度 / 头条 / 微信公众号 官方 API 都有高门槛
 * - v0.1：降级为 Tavily 通用搜索 + "site:<domain>" 限定符
 * - 实现简单但已经能搜到对应站点内的真实内容
 *
 * 未来可替换为：
 * - 知乎开放平台 API（https://openapi.zhihu.com）
 * - 小红书蒲公英 API
 * - 百度搜索广告 API / 头条搜索 API / 微信搜一搜
 */

import { tavilySearch, formatSearchResults } from "./tavily";

/** Tavily 站内搜索统一包装 */
async function tavilySiteSearch(
  site: string,
  query: string,
  maxResults: number
): Promise<string> {
  try {
    const results = await tavilySearch(`site:${site} ${query}`, maxResults);
    return formatSearchResults(results);
  } catch {
    return `（${site} 搜索需要配置 TAVILY_API_KEY）`;
  }
}

/**
 * 知乎搜索
 * 适用：大众经验、深度讨论、行业观点
 */
export async function searchZhihu(
  query: string,
  maxResults: number = 5
): Promise<string> {
  return tavilySiteSearch("zhihu.com", query, maxResults);
}

/**
 * 小红书搜索
 * 适用：生活方式、消费趋势、个人体验类内容
 */
export async function searchXiaohongshu(
  query: string,
  maxResults: number = 5
): Promise<string> {
  return tavilySiteSearch("xiaohongshu.com", query, maxResults);
}

/**
 * 百度搜索（含百度知道、百家号）
 * 适用：权威百科、官方公告、政策解读、时效性新闻
 */
export async function searchBaidu(
  query: string,
  maxResults: number = 5
): Promise<string> {
  // baidu.com 涵盖主站 / baike.baidu.com / zhidao.baidu.com / baijiahao.baidu.com
  return tavilySiteSearch("baidu.com", query, maxResults);
}

/**
 * 今日头条搜索
 * 适用：资讯、观点、热点时效内容；很多热点首发源
 */
export async function searchToutiao(
  query: string,
  maxResults: number = 5
): Promise<string> {
  return tavilySiteSearch("toutiao.com", query, maxResults);
}

/**
 * 微信公众号文章搜索
 * 适用：深度观点、行业分析、自媒体长文
 */
export async function searchWechat(
  query: string,
  maxResults: number = 5
): Promise<string> {
  // mp.weixin.qq.com 是公众号文章主域
  return tavilySiteSearch("mp.weixin.qq.com", query, maxResults);
}

/**
 * 抓取 URL 正文
 * v0.1 占位：直接 fetch HTML + 简单去标签
 */
export async function fetchUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HotWriter/0.1)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return `（HTTP ${response.status}：无法抓取）`;
    }

    const html = await response.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, 3000);
  } catch (err: any) {
    return `（抓取失败：${err.message}）`;
  }
}
