/**
 * Published list prices in USD per 1M tokens, used only as an estimate.
 * Update this table when a provider changes rates. Demo models are $0
 * because they never leave the machine. Unknown model ids fall back to
 * the mini rates and say so via `rateModel`.
 */
export const MODEL_PRICES: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
  "text-embedding-3-large": { inputPerMillion: 0.13, outputPerMillion: 0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
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
): { usd: number; rateModel: string } {
  const known = MODEL_PRICES[model];
  const rateModel = known ? model : inputTokens && !outputTokens ? ILLUSTRATIVE_EMBEDDING_MODEL : ILLUSTRATIVE_CHAT_MODEL;
  const price = MODEL_PRICES[rateModel];
  if (!price) return { usd: 0, rateModel };
  const usd =
    (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000;
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
