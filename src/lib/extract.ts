export type PageText = {
  pageNumber: number;
  text: string;
};

type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

/**
 * Join pdf.js text items into the string we store.
 * Items on the same line sometimes arrive as separate words without a space;
 * items with `hasEOL` end a line. Offsets later refer to this string.
 */
export function pageItemsToText(items: PdfTextItem[]): string {
  let text = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    if (text.length > 0 && !text.endsWith("\n") && item.str.length > 0) {
      const previous = text[text.length - 1];
      const next = item.str[0];
      if (previous && next && !/\s/.test(previous) && !/\s/.test(next)) {
        text += " ";
      }
    }
    text += item.str;
    if (item.hasEOL) text += "\n";
  }
  return normalizePageText(text);
}

/** The stored page string. Chunk offsets and the viewer both use this form. */
export function normalizePageText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text is one page, unless the file contains form-feed characters. */
export function extractPlainPages(text: string): PageText[] {
  const parts = text.replace(/^\uFEFF/, "").split("\f");
  return parts.map((part, index) => ({
    pageNumber: index + 1,
    text: normalizePageText(part),
  }));
}

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{ items: unknown[] }>;
  }>;
  destroy?: () => Promise<void> | void;
};

type PdfjsModule = {
  getDocument: (src: {
    data: Uint8Array;
    disableWorker?: boolean;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    verbosity?: number;
  }) => { promise: Promise<PdfDocument> };
};

export async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  const task = pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const pages: PageText[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        pageNumber,
        text: pageItemsToText(content.items as PdfTextItem[]),
      });
    }
    return pages;
  } finally {
    await doc.destroy?.();
  }
}

export async function extractPages(filename: string, bytes: Uint8Array): Promise<PageText[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return extractPdfPages(bytes);
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return extractPlainPages(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
  }
  throw new Error("Upload a PDF, .txt, or .md file.");
}
