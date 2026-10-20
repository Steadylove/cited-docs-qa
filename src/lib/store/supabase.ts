import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fuseByRank } from "@/lib/retrieve";
import { contentTokens } from "@/lib/tokens";
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

type Row = Record<string, unknown>;

/**
 * Postgres + pgvector via the service role. The browser never receives this key.
 * RLS is enabled with no policies; the service role bypasses it.
 */
export class SupabaseStore implements DocumentStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ensureWorkspace(workspace: Workspace): Promise<void> {
    const { error } = await this.client.from("workspaces").upsert({
      id: workspace.id,
      name: workspace.name,
      owner_id: workspace.ownerId,
    });
    if (error) throw new Error(`Could not save workspace: ${error.message}`);
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
    embeddingTokens: number;
    embeddingCostUsd: number;
  }): Promise<DocumentSummary> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { error } = await this.client.from("documents").insert({
      id,
      workspace_id: input.workspaceId,
      filename: input.filename,
      mime_type: input.mimeType,
      file_base64: Buffer.from(input.bytes).toString("base64"),
      page_count: input.pages.length,
      chunk_count: input.chunks.length,
      embedding_provider: input.embeddingProvider,
      embedding_model: input.embeddingModel,
      created_at: createdAt,
    });
    if (error) throw new Error(`Could not save document: ${error.message}`);

    try {
      if (input.pages.length > 0) {
        const { error: pageError } = await this.client.from("pages").insert(
          input.pages.map((page) => ({
            document_id: id,
            page_number: page.pageNumber,
            text: page.text,
          })),
        );
        if (pageError) throw new Error(pageError.message);
      }
      for (let i = 0; i < input.chunks.length; i += 50) {
        const batch = input.chunks.slice(i, i + 50);
        const { error: chunkError } = await this.client.from("chunks").insert(
          batch.map((chunk) => ({
            id: chunk.id,
            document_id: id,
            workspace_id: input.workspaceId,
            page_number: chunk.pageNumber,
            chunk_index: chunk.chunkIndex,
            content: chunk.content,
            char_start: chunk.charStart,
            char_end: chunk.charEnd,
            embedding: vectorLiteral(chunk.embedding),
          })),
        );
        if (chunkError) throw new Error(chunkError.message);
      }
      await this.insertUsage(input.workspaceId, id, [
        {
          kind: "embed",
          provider: input.embeddingProvider,
          model: input.embeddingModel,
          promptTokens: 0,
          completionTokens: 0,
          embeddingTokens: input.embeddingTokens,
          estimatedCostUsd: input.embeddingCostUsd,
        },
      ]);
    } catch (error) {
      await this.client.from("documents").delete().eq("id", id);
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Could not finish ingestion: ${message}`);
    }

    const usage = await this.usageForWorkspace(input.workspaceId);
    return this.toSummary(
      {
        id,
        workspace_id: input.workspaceId,
        filename: input.filename,
        mime_type: input.mimeType,
        page_count: input.pages.length,
        chunk_count: input.chunks.length,
        embedding_provider: input.embeddingProvider,
        embedding_model: input.embeddingModel,
        created_at: createdAt,
      },
      usage,
    );
  }

  async listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
    const { data, error } = await this.client
      .from("documents")
      .select(
        "id, workspace_id, filename, mime_type, page_count, chunk_count, embedding_provider, embedding_model, created_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not list documents: ${error.message}`);
    const usage = await this.usageForWorkspace(workspaceId);
    return (data ?? []).map((row) => this.toSummary(asRow(row), usage));
  }

  async getDocument(workspaceId: string, documentId: string): Promise<DocumentDetail | null> {
    const { data, error } = await this.client
      .from("documents")
      .select(
        "id, workspace_id, filename, mime_type, page_count, chunk_count, embedding_provider, embedding_model, created_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw new Error(`Could not load document: ${error.message}`);
    if (!data) return null;

    const pages = await this.client
      .from("pages")
      .select("page_number, text")
      .eq("document_id", documentId)
      .order("page_number");
    if (pages.error) throw new Error(pages.error.message);

    const messages = await this.client
      .from("messages")
      .select("*")
      .eq("document_id", documentId)
      .eq("workspace_id", workspaceId)
      .order("created_at");
    if (messages.error) throw new Error(messages.error.message);

    const usage = await this.usageForWorkspace(workspaceId);
    return {
      document: this.toSummary(asRow(data), usage),
      pages: (pages.data ?? []).map((row) => {
        const record = asRow(row);
        return { pageNumber: num(record, "page_number"), text: str(record, "text") };
      }),
      messages: (messages.data ?? []).map((row) => messageFromRow(asRow(row))),
    };
  }

  async getFile(workspaceId: string, documentId: string) {
    const { data, error } = await this.client
      .from("documents")
      .select("filename, mime_type, file_base64")
      .eq("workspace_id", workspaceId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw new Error(`Could not load file: ${error.message}`);
    if (!data) return null;
    const row = asRow(data);
    return {
      filename: str(row, "filename"),
      mimeType: str(row, "mime_type"),
      bytes: new Uint8Array(Buffer.from(str(row, "file_base64"), "base64")),
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
    const { data, error } = await this.client.rpc("match_chunks", {
      p_workspace_id: input.workspaceId,
      p_document_id: input.documentId,
      p_query_embedding: vectorLiteral(input.embedding),
      p_match_count: Math.max(input.limit, 20),
    });
    if (error) {
      throw new Error(
        `Vector search failed: ${error.message}. Apply supabase/migrations/20261020120000_init.sql if you have not.`,
      );
    }
    const vectorHits = ((data ?? []) as unknown[]).map((row) => hitFromRow(asRow(row)));
    if (!input.hybrid) {
      return vectorHits.slice(0, input.limit).map((hit, index) => ({
        ...hit,
        score: typeof (data as Row[])[index]?.similarity === "number"
          ? ((data as Row[])[index].similarity as number)
          : hit.score,
      }));
    }

    const keywordHits = await this.keywordHits(input.workspaceId, input.documentId, input.query);
    const fused = fuseByRank([vectorHits, keywordHits]);
    const similarity = new Map(
      ((data ?? []) as Row[]).map((row) => [str(row, "id"), numberOr(row.similarity, 0)]),
    );
    return fused.slice(0, input.limit).map((hit) => ({
      ...hit,
      score: similarity.get(hit.id) ?? hit.score,
    }));
  }

  async appendExchange(input: {
    workspaceId: string;
    documentId: string;
    question: string;
    answer: AnswerDraft;
    usage: UsageDraft[];
  }) {
    const now = Date.now();
    const user: ChatMessage = emptyUser(input.documentId, input.question, new Date(now).toISOString());
    const assistant: ChatMessage = {
      ...input.answer,
      id: crypto.randomUUID(),
      documentId: input.documentId,
      role: "assistant",
      createdAt: new Date(now + 1).toISOString(),
    };
    const { error } = await this.client.from("messages").insert([
      messageToRow(input.workspaceId, user),
      messageToRow(input.workspaceId, assistant),
    ]);
    if (error) throw new Error(`Could not save messages: ${error.message}`);
    await this.insertUsage(input.workspaceId, input.documentId, input.usage);
    const events = await this.usageForWorkspace(input.workspaceId);
    return {
      user,
      assistant,
      documentSpend: spendFor(events, (event) => event.documentId === input.documentId),
      workspaceSpend: spendFor(events, (event) => event.workspaceId === input.workspaceId),
    };
  }

  async workspaceSpend(workspaceId: string): Promise<Spend> {
    const events = await this.usageForWorkspace(workspaceId);
    return spendFor(events, (event) => event.workspaceId === workspaceId);
  }

  private async keywordHits(workspaceId: string, documentId: string, query: string): Promise<SearchHit[]> {
    const tokens = contentTokens(query).slice(0, 12);
    if (tokens.length === 0) return [];
    const { data, error } = await this.client
      .from("chunks")
      .select("id, page_number, chunk_index, content, char_start, char_end")
      .eq("workspace_id", workspaceId)
      .eq("document_id", documentId)
      .textSearch("content_tsv", tokens.join(" OR "), { type: "websearch", config: "english" })
      .limit(20);
    if (error) return [];
    return (data ?? []).map((row) => hitFromRow(asRow(row)));
  }

  private async insertUsage(workspaceId: string, documentId: string, usage: UsageDraft[]) {
    if (usage.length === 0) return;
    const { error } = await this.client.from("usage_events").insert(
      usage.map((event) => ({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        document_id: documentId,
        kind: event.kind,
        provider: event.provider,
        model: event.model,
        prompt_tokens: event.promptTokens,
        completion_tokens: event.completionTokens,
        embedding_tokens: event.embeddingTokens,
        estimated_cost_usd: event.estimatedCostUsd,
      })),
    );
    if (error) throw new Error(`Could not record usage: ${error.message}`);
  }

  private async usageForWorkspace(workspaceId: string): Promise<StoredUsage[]> {
    const { data, error } = await this.client
      .from("usage_events")
      .select(
        "id, workspace_id, document_id, kind, provider, model, prompt_tokens, completion_tokens, embedding_tokens, estimated_cost_usd",
      )
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(`Could not load usage: ${error.message}`);
    return (data ?? []).map((row) => {
      const record = asRow(row);
      const kind = str(record, "kind");
      if (kind !== "embed" && kind !== "chat") throw new Error(`Unknown usage kind ${kind}.`);
      return {
        id: str(record, "id"),
        workspaceId: str(record, "workspace_id"),
        documentId: record.document_id == null ? null : str(record, "document_id"),
        kind,
        provider: str(record, "provider"),
        model: str(record, "model"),
        promptTokens: num(record, "prompt_tokens"),
        completionTokens: num(record, "completion_tokens"),
        embeddingTokens: num(record, "embedding_tokens"),
        estimatedCostUsd: num(record, "estimated_cost_usd"),
      };
    });
  }

  private toSummary(row: Row, usage: StoredUsage[]): DocumentSummary {
    const id = str(row, "id");
    const spend = spendFor(usage, (event) => event.documentId === id);
    return {
      id,
      workspaceId: str(row, "workspace_id"),
      filename: str(row, "filename"),
      mimeType: str(row, "mime_type"),
      pageCount: num(row, "page_count"),
      chunkCount: num(row, "chunk_count"),
      embeddingProvider: str(row, "embedding_provider"),
      embeddingModel: str(row, "embedding_model"),
      createdAt: str(row, "created_at"),
      totalCostUsd: spend.billedUsd,
      illustrativeCostUsd: spend.illustrativeUsd,
    };
  }
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

function emptyUser(documentId: string, content: string, createdAt: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    documentId,
    role: "user",
    content,
    citations: [],
    droppedCitations: [],
    retrieved: [],
    promptTokens: 0,
    completionTokens: 0,
    embeddingTokens: 0,
    estimatedCostUsd: 0,
    illustrativeCostUsd: 0,
    refused: false,
    createdAt,
  };
}

function messageToRow(workspaceId: string, message: ChatMessage) {
  return {
    id: message.id,
    document_id: message.documentId,
    workspace_id: workspaceId,
    role: message.role,
    content: message.content,
    citations: message.citations,
    dropped_citations: message.droppedCitations,
    retrieved: message.retrieved,
    prompt_tokens: message.promptTokens,
    completion_tokens: message.completionTokens,
    embedding_tokens: message.embeddingTokens,
    estimated_cost_usd: message.estimatedCostUsd,
    illustrative_cost_usd: message.illustrativeCostUsd,
    refused: message.refused,
    created_at: message.createdAt,
  };
}

function messageFromRow(row: Row): ChatMessage {
  const role = str(row, "role");
  if (role !== "user" && role !== "assistant") throw new Error(`Unknown message role ${role}.`);
  return {
    id: str(row, "id"),
    documentId: str(row, "document_id"),
    role,
    content: str(row, "content"),
    citations: Array.isArray(row.citations) ? (row.citations as ChatMessage["citations"]) : [],
    droppedCitations: Array.isArray(row.dropped_citations)
      ? (row.dropped_citations as number[])
      : [],
    retrieved: Array.isArray(row.retrieved) ? (row.retrieved as ChatMessage["retrieved"]) : [],
    promptTokens: num(row, "prompt_tokens"),
    completionTokens: num(row, "completion_tokens"),
    embeddingTokens: num(row, "embedding_tokens"),
    estimatedCostUsd: num(row, "estimated_cost_usd"),
    illustrativeCostUsd: num(row, "illustrative_cost_usd"),
    refused: Boolean(row.refused),
    createdAt: str(row, "created_at"),
  };
}

function hitFromRow(row: Row): SearchHit {
  return {
    id: str(row, "id"),
    pageNumber: num(row, "page_number"),
    chunkIndex: num(row, "chunk_index"),
    content: str(row, "content"),
    charStart: num(row, "char_start"),
    charEnd: num(row, "char_end"),
    score: numberOr(row.similarity, 0),
  };
}

function asRow(value: unknown): Row {
  if (!value || typeof value !== "object") throw new Error("Unexpected row from Supabase.");
  return value as Row;
}

function str(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Expected ${key} to be a string.`);
  return value;
}

function num(row: Row, key: string): number {
  const value = numberOr(row[key], Number.NaN);
  if (!Number.isFinite(value)) throw new Error(`Expected ${key} to be a number.`);
  return value;
}

function numberOr(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return fallback;
}
