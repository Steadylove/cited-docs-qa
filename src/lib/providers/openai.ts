import { EMBEDDING_DIMENSIONS } from "@/lib/constants";
import { embedBatches, streamChatCompletions } from "@/lib/providers/openai-compatible";
import type { ChatStreamer, Embedder, StreamDelta } from "@/lib/providers/types";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/**
 * OpenAI `text-embedding-3-*` is requested at 1024 dimensions so it fits the
 * same column as SiliconFlow `BAAI/bge-m3`. The two spaces are still not
 * interchangeable; the ask path refuses a provider or model mismatch.
 */
export function createOpenAiEmbedder(apiKey: string, model: string): Embedder {
  return {
    provider: "openai",
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    embed(texts) {
      return embedBatches({
        url: OPENAI_EMBEDDINGS_URL,
        apiKey,
        model,
        texts,
        providerLabel: "OpenAI",
        dimensions: EMBEDDING_DIMENSIONS,
      });
    },
  };
}

export function createOpenAiChat(apiKey: string, model: string): ChatStreamer {
  return {
    provider: "openai",
    model,
    stream({ system, user }): AsyncGenerator<StreamDelta> {
      return streamChatCompletions({
        url: OPENAI_CHAT_URL,
        apiKey,
        model,
        system,
        user,
        providerLabel: "OpenAI",
      });
    },
  };
}
