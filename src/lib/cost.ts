/**
 * Published list prices per 1M tokens. One table, on purpose.
 * Unknown ids are not priced: `known` is false and the amount stays 0.
 * They are not silently billed at gpt-4o-mini, and a cache split is not
 * applied to a rate we do not have.
 *
 * Checked 2026-10-20:
 * - DeepSeek off-peak Flash (USD): https://api-docs.deepseek.com/quick_start/pricing
 *   Cache-miss input $0.15, cache-hit input $0.003, output $0.60 per 1M.
 *   Peak (weekdays 01:00–04:00 and 06:00–10:00 UTC) is 2×. This meter uses
 *   off-peak, which covers most hours. Live ids: `deepseek-flash`, `deepseek-v4-pro`.
 * - SiliconFlow, fetched from https://www.siliconflow.cn/pricing on 2026-10-20.
 *   Currency is CNY. This meter does not convert CNY to USD.
 *   `BAAI/bge-m3` prompt and completion are ¥0 / 1M.
 *   `Pro/BAAI/bge-m3` prompt is ¥0.07 / 1M.
 *   `deepseek-ai/DeepSeek-V4.1-Flash` has two windows, per 1M tokens:
 *   0:00–2:00 and 8:00–24:00: input ¥2, cache-hit ¥0.04, output ¥8.
 *   2:00–8:00: input ¥1, cache-hit ¥0.02, output ¥4.
 *   The meter uses the longer window (18 hours), not the clock.
 * - OpenAI and Anthropic figures are the long-standing public list prices (USD).
 */
export type ModelPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheHitPerMillion?: number;
  /** Defaults to USD. SiliconFlow rows are CNY and must not be added to USD. */
  currency?: "USD" | "CNY";
  /** True when the number is a placeholder we could not confirm. */
  unverified?: boolean;
};

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
  "text-embedding-3-large": { inputPerMillion: 0.13, outputPerMillion: 0 },
  "BAAI/bge-m3": { inputPerMillion: 0, outputPerMillion: 0, currency: "CNY" },
  "Pro/BAAI/bge-m3": { inputPerMillion: 0.07, outputPerMillion: 0, currency: "CNY" },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "deepseek-flash": { inputPerMillion: 0.15, outputPerMillion: 0.6, cacheHitPerMillion: 0.003 },
  "deepseek-v4-pro": { inputPerMillion: 0.66, outputPerMillion: 1.98, cacheHitPerMillion: 0.022 },
  "deepseek-ai/DeepSeek-V4.1-Flash": {
    inputPerMillion: 2,
    outputPerMillion: 8,
    cacheHitPerMillion: 0.04,
    currency: "CNY",
  },
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

export type PriceQuote = {
  amount: number;
  currency: "USD" | "CNY";
  rateModel: string;
  /** False when `model` is missing from MODEL_PRICES. Amount is then 0, not a stand-in rate. */
  known: boolean;
  unverified: boolean;
};

export function priceUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  split?: { cacheHitTokens?: number; cacheMissTokens?: number },
): PriceQuote {
  const price = MODEL_PRICES[model];
  if (!price) {
    return { amount: 0, currency: "USD", rateModel: model, known: false, unverified: false };
  }

  const hit = split?.cacheHitTokens;
  const miss = split?.cacheMissTokens;
  const inputAmount =
    price.cacheHitPerMillion != null && hit != null && miss != null
      ? (hit * price.cacheHitPerMillion + miss * price.inputPerMillion) / 1_000_000
      : (inputTokens * price.inputPerMillion) / 1_000_000;
  const amount = inputAmount + (outputTokens * price.outputPerMillion) / 1_000_000;
  return {
    amount: roundUsd(amount),
    currency: price.currency ?? "USD",
    rateModel: model,
    known: true,
    unverified: price.unverified === true,
  };
}

export type UsageLike = {
  kind: "embed" | "chat";
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  estimatedCostUsd: number;
  /** CNY portion. Omitted on older ledger rows; treated as 0. */
  estimatedCostCny?: number;
};

/**
 * Billed spend is the sum of stored estimates (real provider rates, or $0 in demo).
 * Illustrative spend reprices the same token counts as embedding-3-small + gpt-4o-mini
 * so demo mode still shows what the question would have cost.
 */
export function summarizeUsage(events: UsageLike[]): {
  billedUsd: number;
  billedCny: number;
  illustrativeUsd: number;
} {
  let billedUsd = 0;
  let billedCny = 0;
  let illustrative = 0;
  for (const event of events) {
    billedUsd += event.estimatedCostUsd;
    billedCny += event.estimatedCostCny ?? 0;
    if (event.kind === "embed") {
      illustrative += priceUsage(ILLUSTRATIVE_EMBEDDING_MODEL, event.embeddingTokens, 0).amount;
    } else {
      illustrative += priceUsage(ILLUSTRATIVE_CHAT_MODEL, event.promptTokens, event.completionTokens).amount;
    }
  }
  return {
    billedUsd: roundUsd(billedUsd),
    billedCny: roundUsd(billedCny),
    illustrativeUsd: roundUsd(illustrative),
  };
}

export function formatUsd(value: number): string {
  return formatMoney("$", value);
}

export function formatCny(value: number): string {
  return formatMoney("¥", value);
}

/** Show USD, CNY, or both. A zero CNY total is omitted so a USD-only ledger stays `$0.00`. */
export function formatTracked(usd: number, cny: number): string {
  if (cny === 0) return formatUsd(usd);
  if (usd === 0) return formatCny(cny);
  return `${formatUsd(usd)} + ${formatCny(cny)}`;
}

function formatMoney(symbol: string, value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return `${symbol}0.00`;
  if (abs < 0.01) return `${symbol}${value.toFixed(6)}`;
  return `${symbol}${value.toFixed(4)}`;
}
