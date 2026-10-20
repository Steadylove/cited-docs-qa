import { describe, expect, it } from "vitest";
import { estimateTokens, formatUsd, priceUsage, roundUsd, summarizeUsage } from "@/lib/cost";

describe("cost math", () => {
  it("prices chat and embedding tokens from the published table", () => {
    expect(priceUsage("gpt-4o-mini", 1_000_000, 2_000_000)).toMatchObject({
      amount: 1.35,
      currency: "USD",
      rateModel: "gpt-4o-mini",
      known: true,
    });
    expect(priceUsage("text-embedding-3-small", 500_000, 0).amount).toBeCloseTo(0.01, 8);
    expect(priceUsage("demo-extractive", 4_000, 400).amount).toBe(0);
    expect(priceUsage("demo-hash", 4_000, 0).amount).toBe(0);
    expect(priceUsage("BAAI/bge-m3", 1_000_000, 0)).toMatchObject({
      amount: 0,
      currency: "CNY",
      known: true,
    });
    expect(priceUsage("Pro/BAAI/bge-m3", 1_000_000, 0)).toMatchObject({
      amount: 0.07,
      currency: "CNY",
      known: true,
    });
    // Off-peak Flash: cache-miss input $0.15, output $0.60 per 1M.
    expect(priceUsage("deepseek-flash", 1_000_000, 1_000_000).amount).toBeCloseTo(0.75, 8);
    expect(priceUsage("deepseek-flash", 0, 1_000_000).amount).toBeCloseTo(0.6, 8);
    // 800k cache hit at $0.003 plus 200k miss at $0.15 plus $0.60 output.
    expect(
      priceUsage("deepseek-flash", 1_000_000, 1_000_000, {
        cacheHitTokens: 800_000,
        cacheMissTokens: 200_000,
      }).amount,
    ).toBeCloseTo(0.6324, 8);
    expect(priceUsage("deepseek-v4-pro", 1_000_000, 0).amount).toBeCloseTo(0.66, 8);
    // Longer SiliconFlow window: 800k cache hit at ¥0.04, 200k miss at ¥2, output ¥8.
    expect(
      priceUsage("deepseek-ai/DeepSeek-V4.1-Flash", 1_000_000, 1_000_000, {
        cacheHitTokens: 800_000,
        cacheMissTokens: 200_000,
      }),
    ).toMatchObject({ amount: 8.432, currency: "CNY", known: true });
  });

  it("leaves an unknown model unpriced instead of borrowing gpt-4o-mini", () => {
    const unknown = priceUsage("some-new-model", 100, 50, {
      cacheHitTokens: 80,
      cacheMissTokens: 20,
    });
    expect(unknown).toEqual({
      amount: 0,
      currency: "USD",
      rateModel: "some-new-model",
      known: false,
      unverified: false,
    });
    expect(roundUsd(0.123456789)).toBe(0.12345679);
  });

  it("estimates tokens from characters and sums a workspace ledger", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);

    const summary = summarizeUsage([
      {
        kind: "embed",
        promptTokens: 0,
        completionTokens: 0,
        embeddingTokens: 1_000_000,
        estimatedCostUsd: 0.02,
      },
      {
        kind: "chat",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        embeddingTokens: 0,
        estimatedCostUsd: 12.5,
      },
    ]);
    expect(summary.billedUsd).toBeCloseTo(12.52, 8);
    expect(summary.billedCny).toBe(0);
    // Illustrative rates ignore the stored dollars and reprice tokens as
    // embedding-3-small ($0.02) + gpt-4o-mini ($0.15 in + $0.60 out).
    expect(summary.illustrativeUsd).toBeCloseTo(0.77, 8);
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.000045)).toBe("$0.000045");
  });
});
