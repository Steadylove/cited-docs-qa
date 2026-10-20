import { DEEPSEEK_BASE_URL } from "@/lib/constants";
import { chatCompletionsUrl, streamChatCompletions } from "@/lib/providers/openai-compatible";
import type { ChatStreamer, StreamDelta } from "@/lib/providers/types";

/**
 * DeepSeek's chat API is OpenAI-shaped at `{base}/chat/completions`.
 * Current DeepSeek models think by default. We ask for `thinking: disabled`
 * so the stream is the answer, not a reasoning trace. That flag is not
 * part of the OpenAI request, and it has not been checked against a live key.
 */
export function createDeepSeekChat(
  apiKey: string,
  model: string,
  baseUrl = DEEPSEEK_BASE_URL,
): ChatStreamer {
  return {
    provider: "deepseek",
    model,
    stream({ system, user }): AsyncGenerator<StreamDelta> {
      return streamChatCompletions({
        url: chatCompletionsUrl(baseUrl),
        apiKey,
        model,
        system,
        user,
        providerLabel: "DeepSeek",
        extraBody: { thinking: { type: "disabled" } },
      });
    },
  };
}
