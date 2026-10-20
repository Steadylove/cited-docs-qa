import { extractiveAnswer } from "@/lib/answer-demo";
import { mapCitations, validateCitations } from "@/lib/citations";
import { REFUSAL_TEXT, TOP_K } from "@/lib/constants";
import { estimateTokens, priceUsage, roundUsd, ILLUSTRATIVE_CHAT_MODEL, ILLUSTRATIVE_EMBEDDING_MODEL } from "@/lib/cost";
import { buildGroundedPrompt } from "@/lib/prompt";
import type { ChatStreamer, Embedder } from "@/lib/providers/types";
import type { DocumentStore } from "@/lib/store/types";
import type { ChatMessage, Spend } from "@/lib/types";

export type AskEvent =
  | { type: "token"; text: string }
  | { type: "replace"; text: string }
  | {
      type: "done";
      message: ChatMessage;
      documentSpend: Spend;
      workspaceSpend: Spend;
    };

/**
 * Retrieve, answer, validate, record cost.
 * Live models stream raw tokens, then we send `replace` if validation
 * changed the text (invalid markers removed, or a refusal normalized).
 * Demo mode validates first and streams the already-checked text.
 */
export async function* askDocument(options: {
  store: DocumentStore;
  embedder: Embedder;
  chat: ChatStreamer | null;
  workspaceId: string;
  documentId: string;
  question: string;
  hybrid: boolean;
}): AsyncGenerator<AskEvent> {
  const detail = await options.store.getDocument(options.workspaceId, options.documentId);
  if (!detail) throw new Error("Document not found.");
  if (
    detail.document.embeddingProvider !== options.embedder.provider ||
    detail.document.embeddingModel !== options.embedder.model
  ) {
    throw new Error(
      `This document was indexed with ${detail.document.embeddingProvider}/${detail.document.embeddingModel}, but the server is using ${options.embedder.provider}/${options.embedder.model}. Vectors from different models are not comparable. Re-upload the file, or switch EMBEDDING_PROVIDER back.`,
    );
  }

  const embedded = await options.embedder.embed([options.question]);
  const queryVector = embedded.vectors[0];
  if (!queryVector) throw new Error("Could not embed the question.");

  const hits = await options.store.searchChunks({
    workspaceId: options.workspaceId,
    documentId: options.documentId,
    embedding: queryVector,
    query: options.question,
    limit: TOP_K,
    hybrid: options.hybrid,
  });
  if (hits.length === 0) {
    throw new Error("This document has no passages to search.");
  }

  const numbered = hits.map((hit, index) => ({ ...hit, n: index + 1 }));
  const retrieved = numbered.map((hit) => ({
    n: hit.n,
    chunkId: hit.id,
    pageNumber: hit.pageNumber,
    score: Math.round(hit.score * 10000) / 10000,
    preview: hit.content.replace(/\s+/g, " ").trim().slice(0, 180),
  }));

  let raw = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const chatModel = options.chat?.model ?? "demo-extractive";
  const chatProvider = options.chat?.provider ?? "demo";
  const prompt = buildGroundedPrompt(
    options.question,
    numbered.map((hit) => ({ n: hit.n, pageNumber: hit.pageNumber, content: hit.content })),
  );
  // Demo mode never sends this prompt, but we still count it so the
  // illustrative price is "what gpt-4o-mini would have been billed".
  promptTokens = estimateTokens(`${prompt.system}\n${prompt.user}`);

  if (!options.chat) {
    raw = extractiveAnswer(
      options.question,
      numbered.map((hit) => ({ n: hit.n, content: hit.content })),
    ).text;
    for (const slice of slices(raw, 28)) yield { type: "token", text: slice };
    completionTokens = estimateTokens(raw);
  } else {
    for await (const delta of options.chat.stream(prompt)) {
      if (delta.text) {
        raw += delta.text;
        yield { type: "token", text: delta.text };
      }
      if (delta.usage) {
        promptTokens = delta.usage.promptTokens;
        completionTokens = delta.usage.completionTokens;
      }
    }
    if (!deltaUsageWasSet(completionTokens) && raw) {
      completionTokens = estimateTokens(raw);
    }
  }

  const validation = validateCitations(
    raw,
    numbered.map((hit) => ({ n: hit.n, chunkId: hit.id })),
  );
  if (validation.text !== raw) yield { type: "replace", text: validation.text };

  const citations = mapCitations(
    validation,
    numbered.map((hit) => ({
      n: hit.n,
      id: hit.id,
      pageNumber: hit.pageNumber,
      charStart: hit.charStart,
      charEnd: hit.charEnd,
      content: hit.content,
    })),
  );

  const embedPrice = priceUsage(options.embedder.model, embedded.tokens, 0);
  const chatPrice = priceUsage(chatModel, promptTokens, completionTokens);
  const illustrative = roundUsd(
    priceUsage(ILLUSTRATIVE_EMBEDDING_MODEL, embedded.tokens, 0).usd +
      priceUsage(ILLUSTRATIVE_CHAT_MODEL, promptTokens, completionTokens).usd,
  );

  const saved = await options.store.appendExchange({
    workspaceId: options.workspaceId,
    documentId: options.documentId,
    question: options.question,
    answer: {
      content: validation.text,
      citations,
      droppedCitations: validation.dropped,
      retrieved,
      promptTokens,
      completionTokens,
      embeddingTokens: embedded.tokens,
      estimatedCostUsd: roundUsd(embedPrice.usd + chatPrice.usd),
      illustrativeCostUsd: illustrative,
      refused: validation.text === REFUSAL_TEXT,
    },
    usage: [
      {
        kind: "embed",
        provider: options.embedder.provider,
        model: options.embedder.model,
        promptTokens: 0,
        completionTokens: 0,
        embeddingTokens: embedded.tokens,
        estimatedCostUsd: embedPrice.usd,
      },
      {
        kind: "chat",
        provider: chatProvider,
        model: chatModel,
        promptTokens,
        completionTokens,
        embeddingTokens: 0,
        estimatedCostUsd: chatPrice.usd,
      },
    ],
  });

  yield {
    type: "done",
    message: saved.assistant,
    documentSpend: saved.documentSpend,
    workspaceSpend: saved.workspaceSpend,
  };
}

function slices(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts.length > 0 ? parts : [""];
}

function deltaUsageWasSet(completionTokens: number): boolean {
  return completionTokens > 0;
}
