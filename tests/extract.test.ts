import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPages, extractPlainPages, pageItemsToText } from "@/lib/extract";

describe("page extraction", () => {
  it("joins pdf.js items and keeps line breaks", () => {
    const text = pageItemsToText([
      { str: "Harbor & Pine is a Portland coffee roaster.", hasEOL: false },
      { str: "", hasEOL: true },
      { str: "The flagship cafe is at 418 Belmont Street.", hasEOL: false },
    ]);
    expect(text).toBe(
      "Harbor & Pine is a Portland coffee roaster.\nThe flagship cafe is at 418 Belmont Street.",
    );
  });

  it("splits plain text on form feeds and keeps a single page otherwise", () => {
    expect(extractPlainPages("one\f two")).toEqual([
      { pageNumber: 1, text: "one" },
      { pageNumber: 2, text: "two" },
    ]);
    const pages = extractPlainPages("# Notes\n\nHello.");
    expect(pages).toEqual([{ pageNumber: 1, text: "# Notes\n\nHello." }]);
  });

  it("extracts the fixture PDF page by page", async () => {
    const bytes = new Uint8Array(
      readFileSync(path.join(process.cwd(), "fixtures", "harbor-pine-handbook.pdf")),
    );
    const pages = await extractPages("harbor-pine-handbook.pdf", bytes);
    expect(pages).toHaveLength(4);
    expect(pages[0]!.pageNumber).toBe(1);
    expect(pages[0]!.text).toContain("Maya Chen");
    expect(pages[0]!.text).toContain("418 Belmont Street");
    expect(pages[1]!.text).toContain("does not roll over");
    expect(pages[2]!.text).toContain("210 degrees Celsius");
    expect(pages[3]!.text).toContain("40 percent");
    expect(pages[3]!.text).toContain("4 percent of salary");
  });
});
