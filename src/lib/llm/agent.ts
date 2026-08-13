/**
 * 关键词 Agent 主循环
 *
 * 核心逻辑：
 * 1. 接收用户输入的关键词
 * 2. 让 LLM 自主决定调几次工具（web_search / zhihu 等）
 * 3. 多轮工具调用循环（最多 8 轮）
 * 4. 最终输出结构化的写作方向
 */

import { getLLMClient, MODEL_NAME } from "./client";
import { AGENT_TOOLS } from "./tools";
import { SYSTEM_AGENT } from "./prompts";
import { tavilySearch, formatSearchResults } from "../search/tavily";
import {
  searchZhihu,
  searchXiaohongshu,
  searchBaidu,
  searchToutiao,
  searchWechat,
  fetchUrl,
} from "../search/zhihu";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface AgentStep {
  type: "search" | "thinking" | "complete" | "error";
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  message: string; // 用户可见的进度信息
  timestamp: number;
}

export interface AgentResult {
  success: boolean;
  directions?: any;
  summary?: string;
  cost: {
    inputTokens: number;
    outputTokens: number;
    totalCny: string;
  };
  steps: AgentStep[];
  error?: string;
}

export interface AgentOptions {
  keyword: string;
  targetAudience?: string;
  /** 原始热点/文章 URL（来自首页热榜跳转）。有值时 agent 必须先 fetch_url */
  sourceUrl?: string;
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal; // 支持用户取消
}

export async function runKeywordAgent(options: AgentOptions): Promise<AgentResult> {
  const { keyword, targetAudience, sourceUrl, onStep, signal } = options;
  const steps: AgentStep[] = [];
  const client = getLLMClient();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // 输入价格（DeepSeek 参考，¥1/百万 tokens）
  const INPUT_PRICE = 0.000001;
  const OUTPUT_PRICE = 0.000002;

  const emitStep = (s: Omit<AgentStep, "timestamp">) => {
    const step = { ...s, timestamp: Date.now() };
    steps.push(step);
    onStep?.(step);
  };

  // 没有 API key 时直接走兜底
  if (!process.env.DEEPSEEK_API_KEY) {
    emitStep({
      type: "error",
      message: "DEEPSEEK_API_KEY 未配置，无法使用 Agent 调研",
    });
    return {
      success: false,
      error: "DEEPSEEK_API_KEY 未配置",
      steps,
      cost: { inputTokens: 0, outputTokens: 0, totalCny: "0" },
    };
  }

  // 初始消息
  // 若提供了 sourceUrl，第一步必须先 fetch_url 读原文，避免凭印象脑补（如"股王=茅台"幻觉）
  const sourceHint = sourceUrl
    ? `\n\n📰 原文 URL：${sourceUrl}\n**第一步请先调用 fetch_url 抓取这篇原文**，确认标题里的具体名词指什么，再决定方向。`
    : "";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_AGENT },
    {
      role: "user",
      content:
        (targetAudience
          ? `调研主题：${keyword}\n目标读者：${targetAudience}\n\n`
          : `调研主题：${keyword}\n\n`) +
        `请基于你的工具调研后给出 3-5 个差异化的写作方向。` +
        sourceHint,
    },
  ];

  emitStep({
    type: "thinking",
    message: `🤖 开始分析主题：${keyword}`,
  });

  const MAX_ROUNDS = 8;
  let finalContent = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // 用户中断
    if (signal?.aborted) {
      emitStep({ type: "error", message: "用户取消了调研" });
      break;
    }

    emitStep({
      type: "thinking",
      message: `🔄 第 ${round + 1} 轮思考...`,
    });

    let response;
    try {
      response = await client.chat.completions.create({
        model: MODEL_NAME,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.5,
      });
    } catch (err: any) {
      emitStep({
        type: "error",
        message: `❌ LLM 调用失败：${err.message}`,
      });
      return {
        success: false,
        error: err.message,
        steps,
        cost: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalCny: ((totalInputTokens * INPUT_PRICE + totalOutputTokens * OUTPUT_PRICE) || 0).toFixed(4),
        },
      };
    }

    // 累加 token
    if (response.usage) {
      totalInputTokens += response.usage.prompt_tokens;
      totalOutputTokens += response.usage.completion_tokens;
    }

    const choice = response.choices[0];
    const msg = choice.message;

    // 把 assistant 消息加入历史（OpenAI 协议要求）
    messages.push(msg);

    // 没有工具调用，说明 LLM 认为调研完毕
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalContent = msg.content || "";
      emitStep({
        type: "complete",
        message: "✅ 调研完成，正在整理方向...",
      });
      break;
    }

    // 执行工具调用
    for (const toolCall of msg.tool_calls) {
      const fnName = toolCall.function.name;
      let args: any = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      // 显示正在执行的动作
      let actionLabel = "";
      switch (fnName) {
        case "web_search":
          actionLabel = `🔍 搜索：${args.query}`;
          break;
        case "search_zhihu":
          actionLabel = `🔍 知乎搜索：${args.query}`;
          break;
        case "search_xiaohongshu":
          actionLabel = `🔍 小红书搜索：${args.query}`;
          break;
        case "search_baidu":
          actionLabel = `🔍 百度搜索：${args.query}`;
          break;
        case "search_toutiao":
          actionLabel = `🔍 头条搜索：${args.query}`;
          break;
        case "search_wechat":
          actionLabel = `🔍 微信搜索：${args.query}`;
          break;
        case "fetch_url":
          actionLabel = `📖 抓取：${args.url}`;
          break;
      }
      emitStep({
        type: "search",
        tool: fnName,
        args,
        message: actionLabel,
      });

      // 实际执行工具
      let toolResult = "";
      try {
        if (fnName === "web_search") {
          const results = await tavilySearch(args.query || keyword, args.max_results || 5);
          toolResult = formatSearchResults(results);
        } else if (fnName === "search_zhihu") {
          toolResult = await searchZhihu(args.query || keyword);
        } else if (fnName === "search_xiaohongshu") {
          toolResult = await searchXiaohongshu(args.query || keyword);
        } else if (fnName === "search_baidu") {
          toolResult = await searchBaidu(args.query || keyword);
        } else if (fnName === "search_toutiao") {
          toolResult = await searchToutiao(args.query || keyword);
        } else if (fnName === "search_wechat") {
          toolResult = await searchWechat(args.query || keyword);
        } else if (fnName === "fetch_url") {
          toolResult = await fetchUrl(args.url || "");
        }
      } catch (err: any) {
        toolResult = `（工具执行出错：${err.message}）`;
      }

      // 截断过长的工具结果（避免 token 爆炸）
      if (toolResult.length > 5000) {
        toolResult = toolResult.slice(0, 5000) + "\n\n...（内容已截断）";
      }

      // 把工具结果回灌给 LLM
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  // 兜底：达到 MAX_ROUNDS 但 LLM 还没输出 finalContent 时，强制收敛一轮
  // 不调工具，直接基于已有调研信息输出 JSON 方向
  // 触发场景：搜不到 / 敏感话题 / LLM 一直想再搜一轮
  if (!finalContent) {
    emitStep({
      type: "thinking",
      message: "⚠️ 已达工具调用上限，强制收敛输出方向...",
    });

    try {
      messages.push({
        role: "user",
        content: "你已经在上面做了充分的调研。**现在不要再调任何工具**，立即基于已有的搜索结果输出 3-5 个差异化的写作方向。\n\n按 system prompt 里的 JSON 格式输出（含 directions 数组和 summary），用 ```json 代码块包裹。",
      });

      const finalResponse = await client.chat.completions.create({
        model: MODEL_NAME,
        messages,
        tool_choice: "none", // 明确禁止调工具
        temperature: 0.5,
      });

      if (finalResponse.usage) {
        totalInputTokens += finalResponse.usage.prompt_tokens;
        totalOutputTokens += finalResponse.usage.completion_tokens;
      }

      finalContent = finalResponse.choices[0]?.message?.content || "";
    } catch (err: any) {
      emitStep({
        type: "error",
        message: `❌ 强制收敛失败：${err.message}`,
      });
    }
  }

  // 解析最终结构化输出
  let parsed: any = null;
  if (finalContent) {
    const jsonMatch = finalContent.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.warn("解析 LLM 输出的 JSON 失败:", e);
      }
    }

    // 兜底：尝试提取裸 JSON
    if (!parsed) {
      const fallbackMatch = finalContent.match(/\{[\s\S]*"directions"[\s\S]*\}/);
      if (fallbackMatch) {
        try {
          parsed = JSON.parse(fallbackMatch[0]);
        } catch {}
      }
    }
  }

  const totalCost = (
    totalInputTokens * INPUT_PRICE +
    totalOutputTokens * OUTPUT_PRICE
  ).toFixed(4);

  return {
    success: !!parsed,
    directions: parsed?.directions,
    summary: parsed?.summary,
    steps,
    cost: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalCny: totalCost,
    },
    error: !parsed ? "未能从 LLM 输出中解析出方向" : undefined,
  };
}
