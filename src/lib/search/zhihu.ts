/**
 * 知乎 / 小红书 搜索（v0.1 占位实现）
 *
 * 注意：
 * - 知乎官方 API 申请门槛较高（需企业资质）
 * - 小红书也有严格风控
 * - v0.1：降级为通过 Tavily 通用搜索站内关键词
 *
 * 未来可替换为：
 * - 知乎开放平台 API（https://openapi.zhihu.com）
 * - 小红书蒲公英 API
 */

import { tavilySearch, formatSearchResults } from "./tavily";

/**
 * 知乎搜索（v0.1 占位）
 * 实际：调用通用搜索引擎 + "site:zhihu.com"
 */
export async function searchZhihu(
  query: string,
  maxResults: number = 5
): Promise<string> {
  try {
    const results = await tavilySearch(`site:zhihu.com ${query}`, maxResults);
    return formatSearchResults(results);
  } catch (err) {
    return "（知乎搜索功能需要配置 TAVILY_API_KEY）";
  }
}

/**
 * 小红书搜索（v0.1 占位）
 */
export async function searchXiaohongshu(
  query: string,
  maxResults: number = 5
): Promise<string> {
  try {
    const results = await tavilySearch(`site:xiaohongshu.com ${query}`, maxResults);
    return formatSearchResults(results);
  } catch (err) {
    return "（小红书搜索功能需要配置 TAVILY_API_KEY）";
  }
}

/**
 * 抓取 URL 正文
 * v0.1 占位：返回 Tavily 已提取的内容（如果有）
 */
export async function fetchUrl(url: string): Promise<string> {
  // 简单实现：直接 GET 拉 HTML，再用基本的截取逻辑
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

    // 简单去 HTML 标签（生产环境建议用 @mozilla/readability 或类似）
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 截取前 3000 字符
    return text.slice(0, 3000);
  } catch (err: any) {
    return `（抓取失败：${err.message}）`;
  }
}
