/**
 * Agent 工具定义
 *
 * OpenAI 兼容的 function calling 格式
 * 这些工具会被 LLM 在调研时自主决定调用
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "通用 Web 搜索，返回最相关的前 N 个网页摘要。用于查找最新文章、研究报告、行业数据。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词，建议 2-8 个词",
          },
          max_results: {
            type: "number",
            description: "返回结果数量，1-10，默认 5",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_zhihu",
      description: "知乎站内搜索。用于了解大众经验和讨论。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          sort_by: {
            type: "string",
            enum: ["default", "upvote", "time"],
            description: "排序方式，默认 default",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_xiaohongshu",
      description: "小红书搜索。用于了解生活方式、消费趋势、个人体验类内容。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "抓取指定 URL 的正文内容。用于深入阅读搜索到的某篇文章。注意：只用来读已找到的 URL，不要猜测 URL。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "完整的 URL 地址",
          },
        },
        required: ["url"],
      },
    },
  },
];

export type ToolName = "web_search" | "search_zhihu" | "search_xiaohongshu" | "fetch_url";
