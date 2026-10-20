import { EMBEDDING_DIMENSIONS, SILICONFLOW_BASE_URL } from "@/lib/constants";
import { embedBatches, embeddingsUrl } from "@/lib/providers/openai-compatible";
import type { Embedder } from "@/lib/providers/types";

/**
 * SiliconFlow's embeddings API is OpenAI-shaped at `{base}/embeddings`.
 * `BAAI/bge-m3` is natively 1024-d. Do not send `dimensions`: SiliconFlow
 * only accepts that field on its Qwen3 embedding models.
 */
export function createSiliconFlowEmbedder(
  apiKey: string,
  model: string,
  baseUrl = SILICONFLOW_BASE_URL,
): Embedder {
  return {
    provider: "siliconflow",
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    embed(texts) {
      return embedBatches({
        url: embeddingsUrl(baseUrl),
        apiKey,
        model,
        texts,
        providerLabel: "SiliconFlow",
      });
    },
  };
}
