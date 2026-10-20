import { CHUNK_OVERLAP, CHUNK_SIZE } from "@/lib/constants";

export type ChunkPiece = {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
};

export type ChunkOptions = {
  size?: number;
  overlap?: number;
};

/**
 * Slice one page into overlapping windows.
 *
 * `charStart` / `charEnd` are indexes into the stored page text, and
 * `content` is exactly `pageText.slice(charStart, charEnd)`. The source
 * viewer highlights that span, so a chunk that does not round-trip is a bug.
 *
 * Windows break on a newline, a sentence, or a space when one sits in the
 * second half of the window, so a passage usually starts and ends on a
 * word. The next window then steps back by `overlap` characters.
 */
export function chunkPageText(
  pageText: string,
  pageNumber: number,
  options: ChunkOptions = {},
): ChunkPiece[] {
  const size = options.size ?? CHUNK_SIZE;
  const overlap = options.overlap ?? CHUNK_OVERLAP;
  if (size < 1) throw new Error("Chunk size must be positive.");
  if (overlap < 0 || overlap >= size) {
    throw new Error("Chunk overlap must be >= 0 and smaller than the chunk size.");
  }
  if (pageText.trim().length === 0) return [];

  const chunks: ChunkPiece[] = [];
  let start = 0;
  while (start < pageText.length) {
    let end = Math.min(pageText.length, start + size);
    if (end < pageText.length) {
      const window = pageText.slice(start, end);
      const breakAt = Math.max(
        window.lastIndexOf("\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf(" "),
      );
      if (breakAt >= Math.floor(size * 0.5)) end = start + breakAt + 1;
    }
    if (end <= start) end = Math.min(pageText.length, start + size);

    const content = pageText.slice(start, end);
    chunks.push({
      pageNumber,
      chunkIndex: chunks.length,
      content,
      charStart: start,
      charEnd: end,
    });

    if (end >= pageText.length) break;
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return chunks;
}
