export type ChatProviderId = "deepseek" | "openai" | "anthropic" | "demo";
export type EmbeddingProviderId = "siliconflow" | "openai" | "demo";
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
  billedCny: number;
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
  /**
   * `fused` is the reciprocal-rank score the list is ordered by.
   * `vector` is cosine similarity, used when hybrid search is off.
   * Older messages omit this and the UI says "score".
   */
  scoreKind?: "fused" | "vector";
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
  estimatedCostCny: number;
  /** Model ids with no row in MODEL_PRICES. Their dollars were not invented. */
  unpricedModels: string[];
  /** Model ids whose rate is in the table but marked unverified. */
  unverifiedModels: string[];
  illustrativeCostUsd: number;
  /** The whole answer is the refusal sentence. */
  refused: boolean;
  /** Some of the question was answered, and the text still contains the refusal sentence. */
  partial: boolean;
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
  embeddingDimensions: number;
  createdAt: string;
  totalCostUsd: number;
  totalCostCny: number;
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
