/**
 * Published list prices in USD per 1M tokens. One table, on purpose.
 * Update it when a provider changes rates. Unknown ids fall back to the
 * mini rates and say so via `rateModel`.
 *
 * Checked 2026-10-20:
 * - DeepSeek off-peak Flash rates: https://api-docs.deepseek.com/quick_start/pricing
 *   Cache-miss input $0.15, cache-hit input $0.003, output $0.60 per 1M.
 *   Peak (weekdays 01:00–04:00 and 06:00–10:00 UTC) is 2×. This meter uses
 *   off-peak, which covers most hours. `deepseek-chat` was retired on
 *   2026-07-24 (https://api-docs.deepseek.com/news/news260424) and last
 *   routed to Flash non-thinking, so it shares the Flash rate here.
 * - SiliconFlow `BAAI/bge-m3` was marked free on the China price page as of
 *   a 2026-08-21 snapshot. The meter charges $0 for that id. Re-check
 *   https://cloud.siliconflow.cn/models before you trust the zero.
 *   `Pro/BAAI/bge-m3` was ¥0.07 / 1M tokens that day; this table does not
 *   invent a USD conversion, so that id uses the illustrative embedding rate.
 * - OpenAI and Anthropic figures are the long-standing public list prices.
 */
export type ModelPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheHitPerMillion?: number;
};

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
  "text-embedding-3-large": { inputPerMillion: 0.13, outputPerMillion: 0 },
  "BAAI/bge-m3": { inputPerMillion: 0, outputPerMillion: 0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "deepseek-chat": { inputPerMillion: 0.15, outputPerMillion: 0.6, cacheHitPerMillion: 0.003 },
  "deepseek-flash": { inputPerMillion: 0.15, outputPerMillion: 0.6, cacheHitPerMillion: 0.003 },
  "deepseek-v4-pro": { inputPerMillion: 0.66, outputPerMillion: 1.98, cacheHitPerMillion: 0.022 },
  "claude-3-5-haiku-latest": { inputPerMillion: 0.8, outputPerMillion: 4 },
  "claude-3-5-sonnet-latest": { inputPerMillion: 3, outputPerMillion: 15 },
  "demo-hash": { inputPerMillion: 0, outputPerMillion: 0 },
  "demo-extractive": { inputPerMillion: 0, outputPerMillion: 0 },
};

export const ILLUSTRATIVE_CHAT_MODEL = "gpt-4o-mini";
export const ILLUSTRATIVE_EMBEDDING_MODEL = "text-embedding-3-small";

/** Rough token count when an API does not return usage. ~4 characters per token in English. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function roundUsd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

export function priceUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  split?: { cacheHitTokens?: number; cacheMissTokens?: number },
): { usd: number; rateModel: string } {
  const known = MODEL_PRICES[model];
  const rateModel = known ? model : inputTokens && !outputTokens ? ILLUSTRATIVE_EMBEDDING_MODEL : ILLUSTRATIVE_CHAT_MODEL;
  const price = MODEL_PRICES[rateModel];
  if (!price) return { usd: 0, rateModel };

  const hit = split?.cacheHitTokens;
  const miss = split?.cacheMissTokens;
  const inputUsd =
    price.cacheHitPerMillion != null && hit != null && miss != null
      ? (hit * price.cacheHitPerMillion + miss * price.inputPerMillion) / 1_000_000
      : (inputTokens * price.inputPerMillion) / 1_000_000;
  const usd = inputUsd + (outputTokens * price.outputPerMillion) / 1_000_000;
  return { usd: roundUsd(usd), rateModel };
}

export type UsageLike = {
  kind: "embed" | "chat";
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  estimatedCostUsd: number;
};

/**
 * Billed spend is the sum of stored estimates (real provider rates, or $0 in demo).
 * Illustrative spend reprices the same token counts as embedding-3-small + gpt-4o-mini
 * so demo mode still shows what the question would have cost.
 */
export function summarizeUsage(events: UsageLike[]): { billedUsd: number; illustrativeUsd: number } {
  let billed = 0;
  let illustrative = 0;
  for (const event of events) {
    billed += event.estimatedCostUsd;
    if (event.kind === "embed") {
      illustrative += priceUsage(
        ILLUSTRATIVE_EMBEDDING_MODEL,
        event.embeddingTokens,
        0,
      ).usd;
    } else {
      illustrative += priceUsage(
        ILLUSTRATIVE_CHAT_MODEL,
        event.promptTokens,
        event.completionTokens,
      ).usd;
    }
  }
  return { billedUsd: roundUsd(billed), illustrativeUsd: roundUsd(illustrative) };
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(4)}`;
}
