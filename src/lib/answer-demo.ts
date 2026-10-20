import { REFUSAL_TEXT } from "@/lib/constants";
import { overlapScore } from "@/lib/tokens";

export type AnswerChunk = {
  n: number;
  content: string;
};

/**
 * Offline answerer. It does not paraphrase: it copies the retrieved
 * sentences that actually overlap the question and attaches their source
 * numbers. That keeps demo citations real. If nothing clears the overlap
 * bar, it refuses — the same behavior we ask a live model for.
 */
export function extractiveAnswer(
  question: string,
  chunks: AnswerChunk[],
): { text: string; refused: boolean } {
  const sentences: { text: string; n: number; score: number }[] = [];
  for (const chunk of chunks) {
    for (const sentence of splitSentences(chunk.content)) {
      const score = overlapScore(question, sentence);
      if (score > 0) sentences.push({ text: sentence.trim(), n: chunk.n, score });
    }
  }
  sentences.sort((a, b) => b.score - a.score || a.n - b.n);
  const best = sentences[0];
  if (!best || best.score < 0.34) return { text: REFUSAL_TEXT, refused: true };

  const picked = [best];
  const second = sentences[1];
  if (
    second &&
    second.text !== best.text &&
    second.score >= best.score * 0.85 &&
    second.score >= 0.34
  ) {
    picked.push(second);
  }

  return {
    text: picked.map((sentence) => `${sentence.text} [${sentence.n}]`).join(" "),
    refused: false,
  };
}

function splitSentences(content: string): string[] {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
}
