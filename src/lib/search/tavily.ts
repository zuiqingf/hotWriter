/**
 * Tavily 搜索（推荐）
 *
 * Tavily 是 AI 优化过的搜索 API，结果质量好、且免费 1000 次/月
 * 注册：https://tavily.com
 */

export interface TavilyResult {
  title: string;
  url: string;
  content: string;       // 简短摘要
  score: number;         // 相关性分数
}

export async function tavilySearch(
  query: string,
  maxResults: number = 5
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY 未设置");
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: "basic", // basic 比 advanced 快且便宜
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API 错误: ${response.status}`);
    }

    const data = await response.json();
    return (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }));
  } catch (err) {
    console.error("Tavily 搜索失败:", err);
    return [];
  }
}

/**
 * LLM 友好的搜索结果格式化
 */
export function formatSearchResults(results: TavilyResult[]): string {
  if (results.length === 0) return "（未返回任何结果）";
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\n来源: ${r.url}`)
    .join("\n\n");
}
