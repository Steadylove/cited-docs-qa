/**
 * Turn a provider HTTP error into one sentence. 401/402/429 used to reach
 * the chat UI as the raw JSON body.
 */
export function readableProviderError(provider: string, status: number, body: string): string {
  if (status === 401) return `${provider} invalid key.`;
  if (status === 402) return `${provider} balance insufficient.`;
  if (status === 429) return `${provider} rate limit reached. Try again in a moment.`;
  const detail = errorDetail(body);
  if (detail) return `${provider} request failed (${status}): ${detail}`;
  return `${provider} request failed (${status}).`;
}

function errorDetail(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const json = JSON.parse(trimmed) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const message =
      typeof json.error === "string"
        ? json.error
        : typeof json.error?.message === "string"
          ? json.error.message
          : typeof json.message === "string"
            ? json.message
            : "";
    const cleaned = message.replace(/\s+/g, " ").trim();
    return cleaned ? cleaned.slice(0, 180) : null;
  } catch {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null;
    return trimmed.replace(/\s+/g, " ").slice(0, 180);
  }
}
