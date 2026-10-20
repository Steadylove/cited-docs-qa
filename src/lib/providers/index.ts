import type { AppConfig } from "@/lib/config-types";
import { EMBEDDING_DIMENSIONS } from "@/lib/constants";
import { demoEmbed } from "@/lib/embed-demo";
import { createAnthropicChat } from "@/lib/providers/anthropic";
import { createOpenAiChat, createOpenAiEmbedder } from "@/lib/providers/openai";
import type { ChatStreamer, Embedder } from "@/lib/providers/types";

export function getEmbedder(config: AppConfig): Embedder {
  if (config.embeddingProvider === "openai") {
    if (!config.openAiApiKey) throw new Error("OPENAI_API_KEY is required for OpenAI embeddings.");
    return createOpenAiEmbedder(config.openAiApiKey, config.embeddingModel);
  }
  return {
    provider: "demo",
    model: "demo-hash",
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts) {
      return demoEmbed(texts);
    },
  };
}

export function getChatStreamer(config: AppConfig): ChatStreamer | null {
  if (config.chatProvider === "demo") return null;
  if (config.chatProvider === "anthropic") {
    if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is required for Anthropic chat.");
    return createAnthropicChat(config.anthropicApiKey, config.chatModel);
  }
  if (!config.openAiApiKey) throw new Error("OPENAI_API_KEY is required for OpenAI chat.");
  return createOpenAiChat(config.openAiApiKey, config.chatModel);
}
