import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS } from "@/lib/constants";
import { createDeepSeekChat } from "@/lib/providers/deepseek";
import { createOpenAiEmbedder } from "@/lib/providers/openai";
import { createSiliconFlowEmbedder } from "@/lib/providers/siliconflow";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("DeepSeek chat", () => {
  it("streams tokens and reads the cache split", async () => {
    const bodies: unknown[] = [];
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      bodies.push(JSON.parse(String(init?.body)));
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"Cited "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":5,"prompt_cache_hit_tokens":12,"prompt_cache_miss_tokens":8}}\n\n',
        "data: [DONE]\n\n",
      ]);
    }) as typeof fetch;

    const chat = createDeepSeekChat("ds-test", "deepseek-flash");
    const deltas = [];
    for await (const delta of chat.stream({ system: "sys", user: "question" })) deltas.push(delta);

    expect(urls).toEqual(["https://api.deepseek.com/chat/completions"]);
    expect(bodies[0]).toMatchObject({
      model: "deepseek-flash",
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0,
      thinking: { type: "disabled" },
    });
    expect(deltas.map((delta) => delta.text).filter(Boolean).join("")).toBe("Cited answer");
    expect(deltas.at(-1)?.usage).toEqual({
      promptTokens: 20,
      completionTokens: 5,
      cacheHitTokens: 12,
      cacheMissTokens: 8,
    });
  });

  it("joins a custom base URL once", async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return sseResponse(["data: [DONE]\n\n"]);
    }) as typeof fetch;

    const chat = createDeepSeekChat("ds-test", "deepseek-flash", "https://proxy.example/v1/");
    for await (const delta of chat.stream({ system: "s", user: "u" })) {
      expect(delta.text ?? delta.usage).toBeUndefined();
    }
    expect(urls).toEqual(["https://proxy.example/v1/chat/completions"]);
  });
});

describe("SiliconFlow embeddings", () => {
  it("posts bge-m3 without a dimensions field and checks the width", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.siliconflow.cn/v1/embeddings");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sf-test");
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        data: [{ index: 0, embedding: Array(EMBEDDING_DIMENSIONS).fill(0.25) }],
        usage: { total_tokens: 9 },
      });
    }) as typeof fetch;

    const embedder = createSiliconFlowEmbedder("sf-test", "BAAI/bge-m3");
    const result = await embedder.embed(["harbor pine"]);
    expect(bodies[0]).toEqual({ model: "BAAI/bge-m3", input: ["harbor pine"] });
    expect(bodies[0]).not.toHaveProperty("dimensions");
    expect(result.vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(result.tokens).toBe(9);
  });

  it("rejects a vector that is not 1024-d", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ data: [{ index: 0, embedding: [1, 2, 3] }], usage: { total_tokens: 1 } }),
    ) as typeof fetch;
    const embedder = createSiliconFlowEmbedder("sf-test", "BAAI/bge-m3", "https://api.siliconflow.cn/v1/embeddings");
    await expect(embedder.embed(["x"])).rejects.toThrow(/1024/);
  });

  it("surfaces HTTP errors", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 401 })) as typeof fetch;
    const embedder = createSiliconFlowEmbedder("sf-test", "BAAI/bge-m3");
    await expect(embedder.embed(["x"])).rejects.toThrow(/SiliconFlow embeddings failed \(401\)/);
  });
});

describe("OpenAI embeddings", () => {
  it("requests 1024 dimensions", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.openai.com/v1/embeddings");
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        data: [{ index: 0, embedding: Array(EMBEDDING_DIMENSIONS).fill(0.1) }],
        usage: { prompt_tokens: 4 },
      });
    }) as typeof fetch;
    const embedder = createOpenAiEmbedder("sk-test", "text-embedding-3-small");
    const result = await embedder.embed(["page"]);
    expect(body).toMatchObject({
      model: "text-embedding-3-small",
      input: ["page"],
      dimensions: 1024,
    });
    expect(result.vectors[0]).toHaveLength(1024);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
