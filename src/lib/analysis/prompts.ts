/**
 * 用户创作分析 — Prompt 模板
 *
 * 给 LLM：1 篇用户文章 + 同赛道 Top 5 热门文章 → 4 维度差距 + 5-8 条可执行建议。
 *
 * 与 check-compliance 的差异：分析走「找差距 / 给可执行改法」而不是「找违规」。
 */

export const SYSTEM_ANALYST = [
  "你是中文内容策略师，擅长对比同一赛道的文章，找到作者的具体改进点。",
  "",
  "【任务】",
  "用户给了 1 篇他自己的文章 + 同赛道 Top 5 热门文章。",
  "你要输出：",
  "1. 4 个维度的差距分析（标题吸引力 / 开头 hook / 论证结构 / 关键素材）",
  "2. 5-8 条可立即执行的优化建议（不要「建议加强 XXX」这种空话，要「把第三段第一句改为...」）",
  "3. 简要解释每个热门文章比用户文章强在哪",
  "",
  "【4 维度评分标准】",
  "- 标题吸引力（0-100）：好奇心缺口 / 信息密度 / 情感触发 / 关键词前置",
  "- 开头 hook（0-100）：前 100 字能否 3 秒抓住读者 / 是否有冲突或反差",
  "- 论证结构（0-100）：逻辑链是否完整 / 信息节奏（长短句交替）/ 段落长短",
  "- 关键素材（0-100）：数据 / 案例 / 引用是否够硬 / 是否有时效性",
  "",
  "【输出 JSON】",
  "{",
  '  "summary": "一句话总结用户文章的整体表现（30 字内）",',
  '  "gaps": {',
  '    "title":      { "score": 0-100, "issue": "具体问题（10-30 字）", "suggestion": "针对该问题的具体改法" },',
  '    "hook":       { "score": 0-100, "issue": "...", "suggestion": "..." },',
  '    "structure":  { "score": 0-100, "issue": "...", "suggestion": "..." },',
  '    "materials":  { "score": 0-100, "issue": "...", "suggestion": "..." }',
  "  },",
  '  "suggestions": [',
  '    "具体建议 1（要可直接照做）",',
  '    "具体建议 2",',
  '    "..."',
  "  ],",
  '  "hotRefs": [',
  '    { "title": "热门文章标题", "url": "来源 URL（必须照原样使用下方素材里给出的 URL）", "whyBetter": "这篇比用户文章强在哪 1-2 句" }',
  "  ]",
  "}",
  "",
  "【严格要求】",
  "1. 必须按 JSON 格式输出，不要解释、不要客套话、不要 ```json``` 代码块包裹（前端会兜底解析）",
  "2. hotRefs 里的 url 只能从下方素材里复制，不要瞎编",
  "3. suggestion 要可执行：避免「建议加强标题」这种空话，要「把主标题改为『...』，副标题加一句『...』」",
  "4. 如果同赛道素材为空（用户没开 Tavily），请纯基于用户文章自身做评估，hotRefs 留空数组",
  "5. 字数统计：正文已经截到前 3000 字做代表样本，不需要纠结后半部分",
].join("\n");

/** 拼装 user prompt */
export function buildUserPrompt(params: {
  title: string;
  direction: string;
  keyword: string;
  wordCount: number;
  plainText: string;
  hotRefs: { title: string; url: string; content: string }[];
}): string {
  const { title, direction, keyword, wordCount, plainText, hotRefs } = params;

  const userArticle = [
    "## 用户的文章",
    `标题：${title || "（未填）"}`,
    `写作方向：${direction || "（未指定方向）"}`,
    `调研关键词：${keyword || "（无）"}`,
    `字数：${wordCount}`,
    "",
    "### 正文（前 3000 字，已去 HTML）",
    plainText.slice(0, 3000),
  ].join("\n");

  let hotSection: string;
  if (hotRefs.length === 0) {
    hotSection = [
      "## 同赛道热门文章",
      "（未配置 Tavily 或搜索无结果，请基于用户文章自身和你的中文内容知识做评估）",
    ].join("\n");
  } else {
    hotSection = [
      "## 同赛道 Top 5 热门文章",
      `（关键词：${keyword || title || direction}）`,
      "",
      ...hotRefs.map(
        (r, i) =>
          `${i + 1}. 【${r.title}】\n   URL: ${r.url}\n   摘要: ${r.content.slice(0, 400)}`
      ),
    ].join("\n");
  }

  return [userArticle, "", hotSection, "", "请输出 JSON 结果。"].join("\n");
}

/**
 * 结构化输出解析（3 段 fallback，与 check-compliance 一致）：
 *   1. 直接 JSON.parse
 *   2. 提取 ```json ... ``` 围栏
 *   3. 正则匹配首个 { ... } 块
 */
export function parseAnalysisPayload(raw: string): any {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        parsed = JSON.parse(fenced[1].trim());
      } catch {
        /* fall through */
      }
    }
    if (!parsed) {
      const brace = raw.match(/\{[\s\S]*\}/);
      if (brace) {
        try {
          parsed = JSON.parse(brace[0]);
        } catch {
          /* fall through */
        }
      }
    }
    if (!parsed) throw new Error("LLM 输出非 JSON");
  }

  // 字段兜底 + 类型校验
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const gaps = parsed.gaps || {};
  const normGap = (k: string) => {
    const g = gaps[k] || {};
    return {
      score: typeof g.score === "number" ? Math.max(0, Math.min(100, g.score)) : 0,
      issue: typeof g.issue === "string" ? g.issue : "",
      suggestion: typeof g.suggestion === "string" ? g.suggestion : "",
    };
  };
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((s: any) => typeof s === "string")
    : [];
  const hotRefs = Array.isArray(parsed.hotRefs)
    ? parsed.hotRefs
        .filter((r: any) => r && typeof r.title === "string" && typeof r.url === "string")
        .map((r: any) => ({
          title: r.title,
          url: r.url,
          whyBetter: typeof r.whyBetter === "string" ? r.whyBetter : "",
        }))
    : [];

  return { summary, gaps: {
    title: normGap("title"),
    hook: normGap("hook"),
    structure: normGap("structure"),
    materials: normGap("materials"),
  }, suggestions, hotRefs };
}