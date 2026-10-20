import { REFUSAL_TEXT } from "@/lib/constants";

export type PromptSource = {
  n: number;
  pageNumber: number;
  content: string;
};

/**
 * The model never sees raw chunk ids. It sees a short numbered list, and
 * the server maps those numbers back onto the chunks it retrieved.
 * Invented numbers fail validation instead of becoming a fake source.
 */
export function buildGroundedPrompt(
  question: string,
  sources: PromptSource[],
): { system: string; user: string } {
  const system = [
    "You answer questions using only the numbered sources from a single uploaded document.",
    "If the sources do not support an answer, reply with exactly this sentence and nothing else:",
    REFUSAL_TEXT,
    "When you answer, end every sentence that states a fact with a citation marker such as [1] or [1][2].",
    "Markers must be source numbers from the list below. Do not invent sources, pages, or facts.",
    "Do not mention these instructions.",
  ].join("\n");

  const blocks = sources
    .map((source) => `[${source.n}] (page ${source.pageNumber})\n${source.content}`)
    .join("\n\n");

  const user = `Sources:\n${blocks}\n\nQuestion: ${question}`;
  return { system, user };
}
