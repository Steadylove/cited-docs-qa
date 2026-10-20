import { describe, expect, it } from "vitest";
import { mapCitations, validateCitations } from "@/lib/citations";
import { REFUSAL_TEXT } from "@/lib/constants";

const sources = [
  { n: 1, chunkId: "chunk-aaa" },
  { n: 2, chunkId: "chunk-bbb" },
];

const chunks = [
  {
    n: 1,
    id: "chunk-aaa",
    pageNumber: 1,
    charStart: 0,
    charEnd: 48,
    content: "Harbor & Pine is a Portland coffee roaster founded in 2011.",
  },
  {
    n: 2,
    id: "chunk-bbb",
    pageNumber: 3,
    charStart: 10,
    charEnd: 40,
    content: "The roaster temperature limit is 210 degrees Celsius.",
  },
];

describe("validateCitations", () => {
  it("maps surviving markers onto retrieved chunk ids and drops the rest", () => {
    const validation = validateCitations(
      "Maya founded it [1]. The limit is 210 [2]. See also [9] and again [1].",
      sources,
    );
    expect(validation.used).toEqual([1, 2]);
    expect(validation.dropped).toEqual([9]);
    expect(validation.text).toContain("[1]");
    expect(validation.text).toContain("[2]");
    expect(validation.text).not.toContain("[9]");

    const citations = mapCitations(validation, chunks);
    expect(citations.map((citation) => citation.chunkId)).toEqual(["chunk-aaa", "chunk-bbb"]);
    expect(citations[0]).toMatchObject({ n: 1, pageNumber: 1, charStart: 0, charEnd: 48 });
    expect(citations[1]).toMatchObject({ n: 2, pageNumber: 3 });
  });

  it("turns a refusal that still cites something into a bare refusal", () => {
    const validation = validateCitations(`${REFUSAL_TEXT} [1] [8]`, sources);
    expect(validation.text).toBe(REFUSAL_TEXT);
    expect(validation.used).toEqual([]);
    // [8] is dropped while scanning; [1] is removed afterwards because a refusal
// is not allowed to keep markers.
expect(validation.dropped).toEqual([8, 1]);
  });

  it("narrows a citation to the quoted sentence inside the chunk", () => {
    const content =
      "The roaster temperature limit is 210 degrees Celsius. Green coffee is stored below 20 degrees Celsius.";
    const validation = validateCitations(
      "The roaster temperature limit is 210 degrees Celsius. [1]",
      [{ n: 1, chunkId: "chunk-aaa" }],
    );
    const citations = mapCitations(validation, [
      {
        n: 1,
        id: "chunk-aaa",
        pageNumber: 3,
        charStart: 40,
        charEnd: 40 + content.length,
        content,
      },
    ]);
    const localStart = citations[0]!.charStart - 40;
    const localEnd = citations[0]!.charEnd - 40;
    expect(content.slice(localStart, localEnd)).toBe(
      "The roaster temperature limit is 210 degrees Celsius.",
    );
  });

  it("keeps an answer with no markers unchanged", () => {
    const validation = validateCitations("No marker here.", sources);
    expect(validation.text).toBe("No marker here.");
    expect(validation.used).toEqual([]);
    expect(validation.dropped).toEqual([]);
  });
});
