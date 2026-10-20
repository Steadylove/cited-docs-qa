import { randomUUID } from "node:crypto";
import { chunkPageText } from "@/lib/chunk";
import { priceUsage } from "@/lib/cost";
import { extractPages } from "@/lib/extract";
import type { Embedder } from "@/lib/providers/types";
import type { DocumentStore } from "@/lib/store/types";
import type { DocumentSummary } from "@/lib/types";

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "document";
  const cleaned = base.replace(/[\u0000-\u001f"\\]/g, "").trim();
  return cleaned.slice(0, 180) || "document";
}

export function mimeTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

/**
 * Extract, chunk, embed, store.
 * A chunk is rejected if its offsets do not round-trip to the page text.
 * The viewer trusts those offsets, so this is the ingest-time check.
 */
export async function ingestFile(options: {
  store: DocumentStore;
  embedder: Embedder;
  workspaceId: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<DocumentSummary> {
  const filename = safeFilename(options.filename);
  const pages = (await extractPages(filename, options.bytes)).filter((page) => page.text.length > 0);
  if (pages.length === 0) throw new Error("No text found in that file.");

  const pieces = pages.flatMap((page) => chunkPageText(page.text, page.pageNumber));
  for (const piece of pieces) {
    const page = pages.find((item) => item.pageNumber === piece.pageNumber);
    if (!page || page.text.slice(piece.charStart, piece.charEnd) !== piece.content) {
      throw new Error(
        `Chunk ${piece.chunkIndex} on page ${piece.pageNumber} does not match its character offsets.`,
      );
    }
  }

  const embedded = pieces.length
    ? await options.embedder.embed(pieces.map((piece) => piece.content))
    : { vectors: [], tokens: 0 };
  if (embedded.vectors.length !== pieces.length) {
    throw new Error("Embedder returned a different number of vectors than chunks.");
  }

  const priced = priceUsage(options.embedder.model, embedded.tokens, 0);
  return options.store.saveDocument({
    workspaceId: options.workspaceId,
    filename,
    mimeType: mimeTypeFor(filename),
    bytes: options.bytes,
    pages,
    chunks: pieces.map((piece, index) => ({
      id: randomUUID(),
      ...piece,
      // chunk_index is unique per document, not per page.
      chunkIndex: index,
      embedding: embedded.vectors[index] ?? [],
    })),
    embeddingProvider: options.embedder.provider,
    embeddingModel: options.embedder.model,
    embeddingTokens: embedded.tokens,
    embeddingCostUsd: priced.usd,
  });
}
