import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { rankChunks } from "@/lib/retrieve";
import { spendFor, type StoredUsage } from "@/lib/store/spend";
import type {
  AnswerDraft,
  ChunkDraft,
  DocumentStore,
  SearchHit,
  UsageDraft,
} from "@/lib/store/types";
import type {
  ChatMessage,
  DocumentDetail,
  DocumentSummary,
  PageRecord,
  Spend,
  Workspace,
} from "@/lib/types";

type DocumentRow = Omit<DocumentSummary, "totalCostUsd" | "illustrativeCostUsd">;

type Snapshot = {
  version: 1;
  workspaces: Workspace[];
  documents: DocumentRow[];
  pages: Array<PageRecord & { documentId: string }>;
  chunks: Array<ChunkDraft & { documentId: string; workspaceId: string }>;
  files: Array<{ documentId: string; base64: string }>;
  messages: ChatMessage[];
  usage: StoredUsage[];
};

const emptySnapshot = (): Snapshot => ({
  version: 1,
  workspaces: [],
  documents: [],
  pages: [],
  chunks: [],
  files: [],
  messages: [],
  usage: [],
});

/**
 * One-process store persisted as JSON. Enough to try the app with zero setup.
 * Do not use it on Vercel: serverless instances do not share a disk.
 */
export class MemoryStore implements DocumentStore {
  private snapshot: Snapshot = emptySnapshot();
  private ready: Promise<void>;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(options: { filePath?: string } = {}) {
    this.filePath = options.filePath;
    this.ready = this.load();
  }

  private readonly filePath?: string;

  async ensureWorkspace(workspace: Workspace): Promise<void> {
    await this.mutate(async (snapshot) => {
      const existing = snapshot.workspaces.find((item) => item.id === workspace.id);
      if (existing) {
        existing.name = workspace.name;
        existing.ownerId = workspace.ownerId;
      } else {
        snapshot.workspaces.push(workspace);
      }
    });
  }

  async saveDocument(input: {
    workspaceId: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    pages: PageRecord[];
    chunks: ChunkDraft[];
    embeddingProvider: string;
    embeddingModel: string;
    embeddingDimensions: number;
    embeddingTokens: number;
    embeddingCostUsd: number;
  }): Promise<DocumentSummary> {
    const document: DocumentRow = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      filename: input.filename,
      mimeType: input.mimeType,
      pageCount: input.pages.length,
      chunkCount: input.chunks.length,
      embeddingProvider: input.embeddingProvider,
      embeddingModel: input.embeddingModel,
      embeddingDimensions: input.embeddingDimensions,
      createdAt: new Date().toISOString(),
    };
    await this.mutate(async (snapshot) => {
      snapshot.documents.push(document);
      for (const page of input.pages) {
        snapshot.pages.push({ documentId: document.id, ...page });
      }
      for (const chunk of input.chunks) {
        snapshot.chunks.push({
          documentId: document.id,
          workspaceId: input.workspaceId,
          ...chunk,
        });
      }
      snapshot.files.push({
        documentId: document.id,
        base64: Buffer.from(input.bytes).toString("base64"),
      });
      snapshot.usage.push({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        documentId: document.id,
        kind: "embed",
        provider: input.embeddingProvider,
        model: input.embeddingModel,
        promptTokens: 0,
        completionTokens: 0,
        embeddingTokens: input.embeddingTokens,
        estimatedCostUsd: input.embeddingCostUsd,
      });
    });
    return this.withSpend(document, this.snapshot.usage);
  }

  async listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
    await this.ready;
    return this.snapshot.documents
      .filter((document) => document.workspaceId === workspaceId)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((document) => this.withSpend(document, this.snapshot.usage));
  }

  async getDocument(workspaceId: string, documentId: string): Promise<DocumentDetail | null> {
    await this.ready;
    const document = this.snapshot.documents.find(
      (item) => item.id === documentId && item.workspaceId === workspaceId,
    );
    if (!document) return null;
    const pages = this.snapshot.pages
      .filter((page) => page.documentId === documentId)
      .map(({ pageNumber, text }) => ({ pageNumber, text }))
      .sort((a, b) => a.pageNumber - b.pageNumber);
    const messages = this.snapshot.messages
      .filter((message) => message.documentId === documentId)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return { document: this.withSpend(document, this.snapshot.usage), pages, messages };
  }

  async getFile(workspaceId: string, documentId: string) {
    await this.ready;
    const document = this.snapshot.documents.find(
      (item) => item.id === documentId && item.workspaceId === workspaceId,
    );
    const file = this.snapshot.files.find((item) => item.documentId === documentId);
    if (!document || !file) return null;
    return {
      filename: document.filename,
      mimeType: document.mimeType,
      bytes: new Uint8Array(Buffer.from(file.base64, "base64")),
    };
  }

  async searchChunks(input: {
    workspaceId: string;
    documentId: string;
    embedding: number[];
    query: string;
    limit: number;
    hybrid: boolean;
  }): Promise<SearchHit[]> {
    await this.ready;
    const chunks = this.snapshot.chunks.filter(
      (chunk) => chunk.documentId === input.documentId && chunk.workspaceId === input.workspaceId,
    );
    const mismatch = chunks.find((chunk) => chunk.embedding.length !== input.embedding.length);
    if (mismatch) {
      throw new Error(
        `Stored embedding width ${mismatch.embedding.length} does not match the query width ${input.embedding.length}. Re-upload the document.`,
      );
    }
    return rankChunks(chunks, input.embedding, input.query, input.limit, input.hybrid).map(
      (chunk) => ({
        id: chunk.id,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        score: chunk.score,
      }),
    );
  }

  async appendExchange(input: {
    workspaceId: string;
    documentId: string;
    question: string;
    answer: AnswerDraft;
    usage: UsageDraft[];
  }): Promise<{
    user: ChatMessage;
    assistant: ChatMessage;
    documentSpend: Spend;
    workspaceSpend: Spend;
  }> {
    const now = Date.now();
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      documentId: input.documentId,
      role: "user",
      content: input.question,
      citations: [],
      droppedCitations: [],
      retrieved: [],
      promptTokens: 0,
      completionTokens: 0,
      embeddingTokens: 0,
      estimatedCostUsd: 0,
      illustrativeCostUsd: 0,
      refused: false,
      createdAt: new Date(now).toISOString(),
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      documentId: input.documentId,
      role: "assistant",
      createdAt: new Date(now + 1).toISOString(),
      ...input.answer,
    };
    await this.mutate(async (snapshot) => {
      snapshot.messages.push(user, assistant);
      for (const event of input.usage) {
        snapshot.usage.push({
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          ...event,
        });
      }
    });
    return {
      user,
      assistant,
      documentSpend: spendFor(this.snapshot.usage, (event) => event.documentId === input.documentId),
      workspaceSpend: spendFor(this.snapshot.usage, (event) => event.workspaceId === input.workspaceId),
    };
  }

  async workspaceSpend(workspaceId: string): Promise<Spend> {
    await this.ready;
    return spendFor(this.snapshot.usage, (event) => event.workspaceId === workspaceId);
  }

  private withSpend(document: DocumentRow, usage: StoredUsage[]): DocumentSummary {
    const spend = spendFor(usage, (event) => event.documentId === document.id);
    return { ...document, totalCostUsd: spend.billedUsd, illustrativeCostUsd: spend.illustrativeUsd };
  }

  private async load(): Promise<void> {
    if (!this.filePath) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Snapshot;
      if (parsed?.version === 1) {
        // Older snapshots predate embedding_dimensions. 0 fails the ask-time
        // guard, which is what we want: those vectors may be 1536-d.
        this.snapshot = {
          ...parsed,
          documents: (parsed.documents ?? []).map((document) => ({
            ...document,
            embeddingDimensions: Number.isFinite(document.embeddingDimensions)
              ? document.embeddingDimensions
              : 0,
          })),
        };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  private async mutate(fn: (snapshot: Snapshot) => Promise<void> | void): Promise<void> {
    const run = this.chain.then(async () => {
      await this.ready;
      await fn(this.snapshot);
      await this.persist();
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  private async persist(): Promise<void> {
    if (!this.filePath) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(this.snapshot));
    await rename(tmp, this.filePath);
  }
}
