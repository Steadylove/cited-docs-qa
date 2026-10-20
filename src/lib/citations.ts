import { REFUSAL_TEXT } from "@/lib/constants";
import type { Citation } from "@/lib/types";

export type RetrievedSource = {
  n: number;
  chunkId: string;
};

export type CitationValidation = {
  text: string;
  used: number[];
  dropped: number[];
};

const MARKER = /\[(\d+)\]/g;

/**
 * The model is asked to cite with [1], [2], … where those numbers are the
 * passages we just retrieved — not arbitrary chunk ids, which models invent.
 *
 * This runs on the server after generation. A marker whose number is not in
 * the retrieved set is removed. The caller maps the survivors back to chunk
 * ids. Client-side trust is not enough: the browser can only render what we
 * already checked.
 */
export function validateCitations(
  text: string,
  sources: RetrievedSource[],
): CitationValidation {
  const allowed = new Set(sources.map((source) => source.n));
  const dropped: number[] = [];
  const used: number[] = [];
  const seen = new Set<number>();

  const cleaned = text.replace(MARKER, (full, raw: string) => {
    const n = Number(raw);
    if (!allowed.has(n)) {
      dropped.push(n);
      return "";
    }
    if (!seen.has(n)) {
      seen.add(n);
      used.push(n);
    }
    return full;
  });

  let normalized = cleaned.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").trim();

  // The grounded prompt requires this exact sentence when evidence is missing.
  // A refusal does not get to keep citation markers.
  const withoutMarkers = normalized.replace(MARKER, "").replace(/[ \t]{2,}/g, " ").trim();
  if (withoutMarkers === REFUSAL_TEXT) {
    dropped.push(...used);
    used.length = 0;
    normalized = REFUSAL_TEXT;
  }

  return { text: normalized, used, dropped };
}

/**
 * Full refusal is the exact sentence and nothing else.
 * A longer answer that still pastes that sentence answered only part of the
 * question. The prompt asks the model not to do this; the flag catches it
 * when a model does it anyway.
 */
export function classifyAnswer(text: string): { refused: boolean; partial: boolean } {
  if (text.trim() === REFUSAL_TEXT) return { refused: true, partial: false };
  if (text.includes(REFUSAL_TEXT)) return { refused: false, partial: true };
  return { refused: false, partial: false };
}

type MappableChunk = {
  n: number;
  id: string;
  pageNumber: number;
  charStart: number;
  charEnd: number;
  content: string;
};

export function mapCitations(
  validation: CitationValidation,
  chunks: MappableChunk[],
): Citation[] {
  const byNumber = new Map(chunks.map((chunk) => [chunk.n, chunk]));
  return validation.used.map((n) => {
    const chunk = byNumber.get(n);
    if (!chunk) {
      throw new Error(`Citation [${n}] survived validation without a retrieved chunk.`);
    }
    // Prefer the quoted sentence when it actually occurs inside the chunk.
    // A paraphrase that is not a substring keeps the whole chunk span, which
    // is the passage the model was allowed to use.
    const quote = quoteSpan(validation.text, chunk.content, n);
    const charStart = quote ? chunk.charStart + quote.start : chunk.charStart;
    const charEnd = quote ? chunk.charStart + quote.end : chunk.charEnd;
    return {
      n,
      chunkId: chunk.id,
      pageNumber: chunk.pageNumber,
      charStart,
      charEnd,
      preview: chunk.content.slice(quote?.start ?? 0, quote?.end ?? chunk.content.length).replace(/\s+/g, " ").trim().slice(0, 180),
    };
  });
}

function quoteSpan(
  answer: string,
  chunkContent: string,
  n: number,
): { start: number; end: number } | null {
  // Markers sit after the claim ("… Celsius. [1]"), so the quote is the
  // text that precedes [n], not a fresh sentence split that would drop it.
  const parts = answer.split(/(\[\d+\])/);
  const ranges: Array<{ start: number; end: number }> = [];
  let preceding = "";
  for (const part of parts) {
    const match = /^\[(\d+)\]$/.exec(part);
    if (!match) {
      preceding = part;
      continue;
    }
    if (Number(match[1]) !== n) continue;
    const quote = preceding.replace(/\s+/g, " ").trim();
    if (quote.length < 12) continue;
    const at = chunkContent.indexOf(quote);
    if (at >= 0) ranges.push({ start: at, end: at + quote.length });
  }
  if (ranges.length === 0) return null;
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  };
}
