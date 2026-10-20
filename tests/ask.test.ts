import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { askDocument } from "@/lib/ask";
import { loadConfig } from "@/lib/config";
import { REFUSAL_TEXT } from "@/lib/constants";
import { ingestFile } from "@/lib/ingest";
import { getEmbedder } from "@/lib/providers";
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
});

async function collect(events: ReturnType<typeof askDocument>): Promise<ChatMessage> {
  for await (const event of events) {
    if (event.type === "done") return event.message;
  }
  throw new Error("stream ended without a done event");
}
