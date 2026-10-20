export type StreamUsage = {
  promptTokens: number;
  completionTokens: number;
  /** Set together when the provider reports a prompt-cache split (DeepSeek). */
  cacheHitTokens?: number;
  cacheMissTokens?: number;
};

export type StreamDelta = {
  text?: string;
  usage?: StreamUsage;
};

export interface Embedder {
  provider: "siliconflow" | "openai" | "demo";
  model: string;
  dimensions: number;
  embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }>;
}

export interface ChatStreamer {
  provider: "deepseek" | "openai" | "anthropic" | "demo";
  model: string;
  stream(input: { system: string; user: string }): AsyncGenerator<StreamDelta>;
}
