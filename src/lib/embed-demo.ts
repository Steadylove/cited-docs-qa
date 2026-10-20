import { EMBEDDING_DIMENSIONS } from "@/lib/constants";
import { estimateTokens } from "@/lib/cost";
import { contentTokens } from "@/lib/tokens";

/**
 * Deterministic local embedding so retrieval works with no API key.
 *
 * This is feature hashing (the hashing trick): each token adds +1 or -1
 * into a bucket of a 1536-d vector, then we L2-normalize so cosine
 * similarity is a dot product. The width matches text-embedding-3-small
 * only so the database column can stay put. The spaces are not comparable.
 * Re-upload a document after switching embedding providers.
 *
 * Bigrams ("sick_leave") keep phrases from colliding with a page that
 * merely shares one of the words.
 */
export function demoEmbed(
  texts: string[],
  dimensions = EMBEDDING_DIMENSIONS,
): { vectors: number[][]; tokens: number } {
  const vectors = texts.map((text) => hashEmbed(text, dimensions));
  const tokens = texts.reduce((sum, text) => sum + estimateTokens(text), 0);
  return { vectors, tokens };
}

export function hashEmbed(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Float64Array(dimensions);
  const tokens = contentTokens(text);
  const features = [...tokens];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    features.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  for (const feature of features) {
    const hash = fnv1a(feature);
    const index = hash % dimensions;
    const sign = (hash & 0x10) === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return Array.from(vector);
  return Array.from(vector, (value) => value / norm);
}

function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
