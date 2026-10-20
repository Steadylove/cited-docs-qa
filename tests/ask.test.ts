import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { askDocument } from "@/lib/ask";
import { loadConfig } from "@/lib/config";
import { EMBEDDING_DIMENSIONS, REFUSAL_TEXT } from "@/lib/constants";
import { ingestFile } from "@/lib/ingest";
import { getEmbedder } from "@/lib/providers";
import type { ChatStreamer } from "@/lib/providers/types";
import { MemoryStore } from "@/lib/store/memory";
import type { ChatMessage } from "@/lib/types";

const config = loadConfig({
  CHAT_PROVIDER: "demo",
  EMBEDDING_PROVIDER: "demo",
  STORAGE_DRIVER: "memory",
});

describe("demo ask path", () => {
  it("cites the fixture page and refuses when the file is silent", async () => {
    const bytes = new Uint8Array(
      readFileSync(path.join(process.cwd(), "fixtures", "harbor-pine-handbook.pdf")),
    );
    const store = new MemoryStore();
    const embedder = getEmbedder(config);
    await store.ensureWorkspace({
      id: config.workspaceId,
      name: "Test",
      ownerId: "tester",
    });
    const document = await ingestFile({
      store,
      embedder,
      workspaceId: config.workspaceId,
      filename: "harbor-pine-handbook.pdf",
      bytes,
    });
    expect(document.chunkCount).toBeGreaterThan(0);
    expect(document.embeddingDimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(document.totalCostUsd).toBe(0);
    expect(document.illustrativeCostUsd).toBeGreaterThan(0);

    const detail = await store.getDocument(config.workspaceId, document.id);
    expect(detail?.pages[0]?.text.slice(0, 8)).toBeTruthy();

    const founder = await collect(
      askDocument({
        store,
        embedder,
        chat: null,
        workspaceId: config.workspaceId,
        documentId: document.id,
        question: "Who founded Harbor & Pine and in what year?",
        hybrid: true,
      }),
    );
    expect(founder.content).toContain("Maya Chen");
    expect(founder.citations.length).toBeGreaterThan(0);
    const citation = founder.citations[0]!;
    expect(citation.pageNumber).toBe(1);
    const page = detail!.pages.find((item) => item.pageNumber === citation.pageNumber)!;
    expect(page.text.slice(citation.charStart, citation.charEnd)).toContain("Maya Chen");
    expect(founder.estimatedCostUsd).toBe(0);
    expect(founder.partial).toBe(false);
    expect(founder.unpricedModels).toEqual([]);
    const fused = founder.retrieved.map((passage) => passage.score);
    expect(fused).toEqual([...fused].sort((a, b) => b - a));
    expect(founder.retrieved[0]?.scoreKind).toBe("fused");
    expect(founder.illustrativeCostUsd).toBeGreaterThan(0);
    expect(founder.promptTokens).toBeGreaterThan(0);

    const refusal = await collect(
      askDocument({
        store,
        embedder,
        chat: null,
        workspaceId: config.workspaceId,
        documentId: document.id,
        question: "What is the company policy on pet insurance?",
        hybrid: true,
      }),
    );
    expect(refusal.refused).toBe(true);
    expect(refusal.content).toBe(REFUSAL_TEXT);
    expect(refusal.citations).toEqual([]);
  });

  it("refuses a different embedding space and prices a DeepSeek cache split", async () => {
    const bytes = new Uint8Array(
      readFileSync(path.join(process.cwd(), "fixtures", "harbor-pine-handbook.pdf")),
    );
    const store = new MemoryStore();
    const embedder = getEmbedder(config);
    await store.ensureWorkspace({ id: config.workspaceId, name: "Test", ownerId: "tester" });
    const document = await ingestFile({
      store,
      embedder,
      workspaceId: config.workspaceId,
      filename: "harbor-pine-handbook.pdf",
      bytes,
    });

    const other = {
      provider: "siliconflow" as const,
      model: "BAAI/bge-m3",
      dimensions: EMBEDDING_DIMENSIONS,
      embed: async () => ({ vectors: [Array(EMBEDDING_DIMENSIONS).fill(0)], tokens: 1 }),
    };
    await expect(
      collect(
        askDocument({
          store,
          embedder: other,
          chat: null,
          workspaceId: config.workspaceId,
          documentId: document.id,
          question: "Who founded Harbor & Pine?",
          hybrid: false,
        }),
      ),
    ).rejects.toThrow(/not comparable/);

    await expect(
      store.searchChunks({
        workspaceId: config.workspaceId,
        documentId: document.id,
        embedding: [0, 1, 2],
        query: "founder",
        limit: 3,
        hybrid: false,
      }),
    ).rejects.toThrow(/width/);

    const chat: ChatStreamer = {
      provider: "deepseek",
      model: "deepseek-flash",
      async *stream() {
        yield { text: "Maya Chen founded Harbor & Pine in 2014. [1]" };
        yield {
          usage: {
            promptTokens: 1_000_000,
            completionTokens: 1_000_000,
            cacheHitTokens: 800_000,
            cacheMissTokens: 200_000,
          },
        };
      },
    };
    const priced = await collect(
      askDocument({
        store,
        embedder,
        chat,
        workspaceId: config.workspaceId,
        documentId: document.id,
        question: "Who founded Harbor & Pine and in what year?",
        hybrid: true,
      }),
    );
    expect(priced.content).toContain("[1]");
    expect(priced.estimatedCostUsd).toBeCloseTo(0.6324, 8);
    expect(priced.partial).toBe(false);

    const partialChat: ChatStreamer = {
      provider: "deepseek",
      model: "deepseek-flash",
      async *stream() {
        yield {
          text: `Maya Chen founded Harbor & Pine in 2014. [1] ${REFUSAL_TEXT}`,
        };
      },
    };
    const partial = await collect(
      askDocument({
        store,
        embedder,
        chat: partialChat,
        workspaceId: config.workspaceId,
        documentId: document.id,
        question: "Who founded Harbor & Pine, and what is the pet insurance policy?",
        hybrid: true,
      }),
    );
    expect(partial.refused).toBe(false);
    expect(partial.partial).toBe(true);
    expect(partial.citations.length).toBeGreaterThan(0);
    expect(partial.content).toContain(REFUSAL_TEXT);

    const unpricedChat: ChatStreamer = {
      provider: "deepseek",
      model: "some-unlisted-model",
      async *stream() {
        yield { text: "Maya Chen founded Harbor & Pine in 2014. [1]" };
        yield { usage: { promptTokens: 100, completionTokens: 20, cacheHitTokens: 40, cacheMissTokens: 60 } };
      },
    };
    const unpriced = await collect(
      askDocument({
        store,
        embedder,
        chat: unpricedChat,
        workspaceId: config.workspaceId,
        documentId: document.id,
        question: "Who founded Harbor & Pine and in what year?",
        hybrid: true,
      }),
    );
    expect(unpriced.unpricedModels).toContain("some-unlisted-model");
    expect(unpriced.estimatedCostUsd).toBe(0);
  });
});

async function collect(events: ReturnType<typeof askDocument>): Promise<ChatMessage> {
  for await (const event of events) {
    if (event.type === "done") return event.message;
  }
  throw new Error("stream ended without a done event");
}
