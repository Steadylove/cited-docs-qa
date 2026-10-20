import { EMBEDDING_DIMENSIONS } from "@/lib/constants";
import type { ChatStreamer, Embedder, StreamDelta } from "@/lib/providers/types";
import { readSse } from "@/lib/providers/sse";

const EMBED_BATCH = 64;

export function createOpenAiEmbedder(apiKey: string, model: string): Embedder {
  return {
    provider: "openai",
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts) {
      if (texts.length === 0) return { vectors: [], tokens: 0 };
      const vectors: number[][] = [];
      let tokens = 0;
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const batch = texts.slice(i, i + EMBED_BATCH);
        const result = await embedBatch(apiKey, model, batch);
        vectors.push(...result.vectors);
        tokens += result.tokens;
      }
      return { vectors, tokens };
    },
  };
}

async function embedBatch(apiKey: string, model: string, input: string[]) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI embeddings failed (${response.status}): ${detail.slice(0, 280)}`);
  }
  const json = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
    usage?: { total_tokens?: number; prompt_tokens?: number };
  };
  const vectors = (json.data ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
  if (vectors.length !== input.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(
      `Expected ${input.length} embeddings of ${EMBEDDING_DIMENSIONS} dimensions. The pgvector column is fixed at that width.`,
    );
  }
  return {
    vectors,
    tokens: json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0,
  };
}

export function createOpenAiChat(apiKey: string, model: string): ChatStreamer {
  return {
    provider: "openai",
    model,
    async *stream({ system, user }): AsyncGenerator<StreamDelta> {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(`OpenAI chat failed (${response.status}): ${detail.slice(0, 280)}`);
      }
      for await (const event of readSse(response.body)) {
        if (event.data === "[DONE]") return;
        const json = JSON.parse(event.data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = json.choices?.[0]?.delta?.content;
        if (text) yield { text };
        if (json.usage) {
          yield {
            usage: {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
            },
          };
        }
      }
    },
  };
}
