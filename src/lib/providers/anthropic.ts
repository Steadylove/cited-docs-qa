import type { ChatStreamer, StreamDelta } from "@/lib/providers/types";
import { readSse } from "@/lib/providers/sse";

export function createAnthropicChat(apiKey: string, model: string): ChatStreamer {
  return {
    provider: "anthropic",
    model,
    async *stream({ system, user }): AsyncGenerator<StreamDelta> {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          temperature: 0,
          stream: true,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(`Anthropic chat failed (${response.status}): ${detail.slice(0, 280)}`);
      }

      let promptTokens = 0;
      let completionTokens = 0;
      for await (const event of readSse(response.body)) {
        const json = JSON.parse(event.data) as {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        if (event.event === "content_block_delta" && json.delta?.text) {
          yield { text: json.delta.text };
        }
        if (json.message?.usage?.input_tokens) promptTokens = json.message.usage.input_tokens;
        if (json.usage?.output_tokens) completionTokens = json.usage.output_tokens;
        if (json.usage?.input_tokens) promptTokens = json.usage.input_tokens;
      }
      if (promptTokens || completionTokens) {
        yield { usage: { promptTokens, completionTokens } };
      }
    },
  };
}
