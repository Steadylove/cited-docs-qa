import { overlapScore } from "@/lib/tokens";

export { overlapScore };

export function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Reciprocal rank fusion. Each list contributes 1 / (k + rank), rank starting
 * at 1. A passage that is high in both the vector list and the keyword list
 * beats one that only the embedder liked. k = 60 is the usual default from
 * Cormack, Clarke, and Buettcher (2009): it keeps a single list from dominating.
 */
export function fuseByRank<T extends { id: string }>(
  lists: T[][],
  k = 60,
): Array<T & { fusedScore: number }> {
  const score = new Map<string, number>();
  const item = new Map<string, T>();
  for (const list of lists) {
    list.forEach((entry, index) => {
      item.set(entry.id, entry);
      score.set(entry.id, (score.get(entry.id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...item.values()]
    .sort((a, b) => {
      const delta = (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0);
      if (delta !== 0) return delta;
      return a.id < b.id ? -1 : 1;
    })
    .map((entry) => ({ ...entry, fusedScore: score.get(entry.id) ?? 0 }));
}

export type RankableChunk = {
  id: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  embedding: number[];
};

export type RankedChunk = RankableChunk & { score: number };

export function rankChunks(
  chunks: RankableChunk[],
  queryEmbedding: number[],
  query: string,
  limit: number,
  hybrid: boolean,
): RankedChunk[] {
  const scored = chunks.map((chunk) => ({
    chunk,
    vector: cosine(chunk.embedding, queryEmbedding),
    keyword: overlapScore(query, chunk.content),
  }));
  const byVector = [...scored].sort((a, b) => b.vector - a.vector || a.chunk.id.localeCompare(b.chunk.id));
  if (!hybrid) {
    return byVector.slice(0, limit).map((entry) => ({ ...entry.chunk, score: entry.vector }));
  }
  const byKeyword = scored
    .filter((entry) => entry.keyword > 0)
    .sort((a, b) => b.keyword - a.keyword || a.chunk.id.localeCompare(b.chunk.id));
  const fused = fuseByRank([
    byVector.map((entry) => entry.chunk),
    byKeyword.map((entry) => entry.chunk),
  ]);
  return fused.slice(0, limit).map(({ fusedScore, ...chunk }) => ({
    ...chunk,
    score: fusedScore,
  }));
}
