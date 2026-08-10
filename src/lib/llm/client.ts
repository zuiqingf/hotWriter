/**
 * LLM 客户端
 *
 * v0.1: 用 DeepSeek（OpenAI 兼容）
 * 未来: 可切换 Claude / 国内其他模型
 *
 * 用法：
 *   import { llm } from "@/lib/llm/client";
 *   const response = await llm.client.chat.completions.create({...})
 */

import OpenAI from "openai";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";

// 单例：避免重复创建
let clientInstance: OpenAI | null = null;

export function getLLMClient(): OpenAI {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "未设置 DEEPSEEK_API_KEY。请在 .env 中填入 DeepSeek API Key。\n" +
        "获取地址：https://platform.deepseek.com/"
    );
  }

  clientInstance = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    timeout: 60_000, // 60s 超时
    maxRetries: 2,
  });

  return clientInstance;
}

export const MODEL_NAME = DEEPSEEK_MODEL;

/**
 * 是否已配置 API Key（用于 UI 提示）
 */
export function isLLMConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}
