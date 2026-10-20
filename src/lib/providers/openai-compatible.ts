import { EMBEDDING_DIMENSIONS } from "@/lib/constants";
import { readableProviderError } from "@/lib/providers/errors";
import type { StreamDelta, StreamUsage } from "@/lib/providers/types";
import { readSse } from "@/lib/providers/sse";

const EMBED_BATCH = 64;

type UsageJson = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

/** Join an OpenAI-compatible base URL with `/chat/completions` once. */
export function chatCompletionsUrl(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

/** Join an OpenAI-compatible base URL with `/embeddings` once. */
export function embeddingsUrl(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/embeddings") ? trimmed : `${trimmed}/embeddings`;
}

/**
 * Shared embeddings POST. `dimensions` is sent only when the caller sets it.
 * SiliconFlow `BAAI/bge-m3` rejects that field (only its Qwen3 models accept it).
 * OpenAI `text-embedding-3-*` needs it so the vector fits the 1024-d column.
 */
export async function embedBatches(options: {
  url: string;
  apiKey: string;
  model: string;
  texts: string[];
  providerLabel: string;
  dimensions?: number;
}): Promise<{ vectors: number[][]; tokens: number }> {
  if (options.texts.length === 0) return { vectors: [], tokens: 0 };
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < options.texts.length; i += EMBED_BATCH) {
    const batch = options.texts.slice(i, i + EMBED_BATCH);
    const result = await embedBatch({ ...options, input: batch });
    vectors.push(...result.vectors);
    tokens += result.tokens;
  }
  return { vectors, tokens };
}

async function embedBatch(options: {
  url: string;
  apiKey: string;
  model: string;
  input: string[];
  providerLabel: string;
  dimensions?: number;
}): Promise<{ vectors: number[][]; tokens: number }> {
  const body: Record<string, unknown> = { model: options.model, input: options.input };
  if (options.dimensions != null) body.dimensions = options.dimensions;

  const response = await fetch(options.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(readableProviderError(options.providerLabel, response.status, detail));
  }
  const json = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
    usage?: UsageJson;
  };
  const vectors = (json.data ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
  const width = options.dimensions ?? EMBEDDING_DIMENSIONS;
  if (vectors.length !== options.input.length || vectors.some((vector) => vector.length !== width)) {
    throw new Error(
      `Expected ${options.input.length} embeddings of ${width} dimensions from ${options.providerLabel}. The pgvector column is fixed at ${EMBEDDING_DIMENSIONS}.`,
    );
  }
  return {
    vectors,
    tokens: json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0,
  };
}

/**
 * OpenAI-compatible chat stream. `extraBody` is how DeepSeek turns thinking off
 * without changing the OpenAI request.
 */
export async function* streamChatCompletions(options: {
  url: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  providerLabel: string;
  extraBody?: Record<string, unknown>;
}): AsyncGenerator<StreamDelta> {
  const response = await fetch(options.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      ...options.extraBody,
    }),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(readableProviderError(options.providerLabel, response.status, detail));
  }
  for await (const event of readSse(response.body)) {
    if (event.data === "[DONE]") return;
    const json = JSON.parse(event.data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: UsageJson;
    };
    const text = json.choices?.[0]?.delta?.content;
    if (text) yield { text };
    const usage = usageFrom(json.usage);
    if (usage) yield { usage };
  }
}

function usageFrom(raw: UsageJson | undefined): StreamUsage | undefined {
  if (!raw) return undefined;
  const usage: StreamUsage = {
    promptTokens: raw.prompt_tokens ?? 0,
    completionTokens: raw.completion_tokens ?? 0,
  };
  // DeepSeek reports the cache split beside the OpenAI-style totals.
  // Apply the cheaper hit rate only when both counts are present.
  if (raw.prompt_cache_hit_tokens != null && raw.prompt_cache_miss_tokens != null) {
    usage.cacheHitTokens = raw.prompt_cache_hit_tokens;
    usage.cacheMissTokens = raw.prompt_cache_miss_tokens;
  }
  return usage;
}
