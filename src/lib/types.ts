export type ChatProviderId = "openai" | "anthropic" | "demo";
export type EmbeddingProviderId = "openai" | "demo";
export type StorageDriver = "supabase" | "memory";

/** Safe to send to the browser. Never add keys here. */
export type PublicConfig = {
  chatProvider: ChatProviderId;
  chatModel: string;
  embeddingProvider: EmbeddingProviderId;
  embeddingModel: string;
  storageDriver: StorageDriver;
  hybridSearch: boolean;
  /** True when either chat or embeddings are not calling a paid API. */
  demo: boolean;
  notes: string[];
};

export type Spend = {
  billedUsd: number;
  illustrativeUsd: number;
};

export type Citation = {
  n: number;
  chunkId: string;
  pageNumber: number;
  charStart: number;
  charEnd: number;
  preview: string;
};

export type RetrievedPassage = {
  n: number;
  chunkId: string;
  pageNumber: number;
  score: number;
  preview: string;
};

export type ChatMessage = {
  id: string;
  documentId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  droppedCitations: number[];
  retrieved: RetrievedPassage[];
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  estimatedCostUsd: number;
  illustrativeCostUsd: number;
  refused: boolean;
  createdAt: string;
};

export type DocumentSummary = {
  id: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  pageCount: number;
  chunkCount: number;
  embeddingProvider: string;
  embeddingModel: string;
  createdAt: string;
  totalCostUsd: number;
  illustrativeCostUsd: number;
};

export type PageRecord = {
  pageNumber: number;
  text: string;
};

export type DocumentDetail = {
  document: DocumentSummary;
  pages: PageRecord[];
  messages: ChatMessage[];
};

export type Workspace = {
  id: string;
  name: string;
  ownerId: string;
};
