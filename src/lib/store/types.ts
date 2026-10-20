import type {
  ChatMessage,
  DocumentDetail,
  DocumentSummary,
  PageRecord,
  Spend,
  Workspace,
} from "@/lib/types";

export type ChunkDraft = {
  id: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  embedding: number[];
};

export type SearchHit = {
  id: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  score: number;
};

export type UsageDraft = {
  kind: "embed" | "chat";
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  estimatedCostUsd: number;
};

export type AnswerDraft = Omit<ChatMessage, "id" | "documentId" | "role" | "createdAt">;

/**
 * Storage behind the app. `MemoryStore` is a JSON file for local demo mode.
 * `SupabaseStore` is Postgres + pgvector. Both enforce workspace id on every
 * read so a second tenant is a filter, not a rewrite.
 */
export interface DocumentStore {
  ensureWorkspace(workspace: Workspace): Promise<void>;
  saveDocument(input: {
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
  }): Promise<DocumentSummary>;
  listDocuments(workspaceId: string): Promise<DocumentSummary[]>;
  getDocument(workspaceId: string, documentId: string): Promise<DocumentDetail | null>;
  getFile(
    workspaceId: string,
    documentId: string,
  ): Promise<{ filename: string; mimeType: string; bytes: Uint8Array } | null>;
  searchChunks(input: {
    workspaceId: string;
    documentId: string;
    embedding: number[];
    query: string;
    limit: number;
    hybrid: boolean;
  }): Promise<SearchHit[]>;
  appendExchange(input: {
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
  }>;
  workspaceSpend(workspaceId: string): Promise<Spend>;
}
