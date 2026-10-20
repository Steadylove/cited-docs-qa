import { DEEPSEEK_BASE_URL } from "@/lib/constants";
import { chatCompletionsUrl, streamChatCompletions } from "@/lib/providers/openai-compatible";
import type { ChatStreamer, StreamDelta } from "@/lib/providers/types";

/**
 * DeepSeek's chat API is OpenAI-shaped at `{base}/chat/completions`.
 * Official DeepSeek hosts think by default, so those calls send
 * `thinking: disabled` and the stream stays the answer. SiliconFlow's
 * compatible endpoint does not use that field; pointing DEEPSEEK_BASE_URL
 * at it omits the flag. The flag has not been checked against a live key.
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
        extraBody: deepseekThinking(baseUrl),
      });
    },
  };
}

function deepseekThinking(baseUrl: string): Record<string, unknown> | undefined {
  try {
    const host = new URL(baseUrl).host;
    if (host === "api.deepseek.com" || host.endsWith(".deepseek.com")) {
      return { thinking: { type: "disabled" } };
    }
  } catch {
    return undefined;
  }
  return undefined;
}
