/**
 * 成本追踪（直接 SQL 版）
 */

import { db } from "../db";

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalCny: number;
}

export const PRICING = {
  "deepseek-chat": {
    input: 0.000001,
    output: 0.000002,
  },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): CostEstimate {
  const price = PRICING[model as keyof typeof PRICING] || PRICING["deepseek-chat"];
  return {
    inputTokens,
    outputTokens,
    totalCny: inputTokens * price.input + outputTokens * price.output,
  };
}

export async function getMonthlyCost(): Promise<number> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTs = Math.floor(startOfMonth.getTime() / 1000);

    const rows = db.all(
      "SELECT cost_cny FROM usage_logs WHERE created_at >= ?",
      [startTs]
    );

    return rows.reduce((sum, r) => sum + (r.cost_cny ? parseFloat(r.cost_cny) : 0), 0);
  } catch (err) {
    console.warn("成本查询失败:", err);
    return 0;
  }
}

export async function logUsage(params: {
  action: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCny: number;
  durationMs?: number;
  articleId?: number;
  sessionId?: number;
}) {
  try {
    db.run(
      `INSERT INTO usage_logs
       (action, model, tokens_input, tokens_output, cost_cny, duration_ms, article_id, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.action,
        params.model,
        params.inputTokens,
        params.outputTokens,
        params.costCny.toFixed(6),
        params.durationMs ?? null,
        params.articleId ?? null,
        params.sessionId ?? null,
      ]
    );
  } catch (err) {
    console.warn("记录 usage 失败:", err);
  }
}

export const MONTHLY_BUDGET = 30;
