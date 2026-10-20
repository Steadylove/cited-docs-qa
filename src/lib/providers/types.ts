export type StreamUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type StreamDelta = {
  text?: string;
  usage?: StreamUsage;
};

export interface Embedder {
  provider: "openai" | "demo";
  model: string;
  dimensions: number;
  embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }>;
}

export interface ChatStreamer {
  provider: "openai" | "anthropic" | "demo";
  model: string;
  stream(input: { system: string; user: string }): AsyncGenerator<StreamDelta>;
}
