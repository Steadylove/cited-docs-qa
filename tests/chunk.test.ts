import { describe, expect, it } from "vitest";
import { chunkPageText } from "@/lib/chunk";

describe("chunkPageText", () => {
  it("returns no chunks for blank pages", () => {
    expect(chunkPageText("   \n", 1)).toEqual([]);
  });

  it("keeps a short page as one chunk with exact offsets", () => {
    const text = "Harbor & Pine was founded in 2011.";
    const chunks = chunkPageText(text, 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      pageNumber: 4,
      chunkIndex: 0,
      charStart: 0,
      charEnd: text.length,
      content: text,
    });
    expect(text.slice(chunks[0]!.charStart, chunks[0]!.charEnd)).toBe(chunks[0]!.content);
  });

  it("covers a long page with overlap and round-trip offsets", () => {
    const text = Array.from(
      { length: 80 },
      (_, index) => `Sentence number ${index} talks about hops and barley in detail.`,
    ).join(" ");
    const chunks = chunkPageText(text, 2, { size: 500, overlap: 80 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.charStart).toBe(0);
    expect(chunks.at(-1)!.charEnd).toBe(text.length);

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]!;
      expect(chunk.pageNumber).toBe(2);
      expect(chunk.chunkIndex).toBe(i);
      expect(text.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content);
      expect(chunk.charEnd - chunk.charStart).toBeLessThanOrEqual(500);
      if (i > 0) {
        const previous = chunks[i - 1]!;
        expect(chunk.charStart).toBeLessThan(previous.charEnd);
        expect(chunk.charStart).toBeGreaterThan(previous.charStart);
      }
    }
  });
});
