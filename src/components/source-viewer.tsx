"use client";

import { useEffect, useRef } from "react";
import type { Citation, PageRecord } from "@/lib/types";

/**
 * The highlight is a slice of the stored page text, using the same character
 * offsets written at ingest. Painting that span onto PDF glyphs would require
 * lining those offsets up with pdf.js text positions, and the two strings are
 * not the same once whitespace is normalized. The PDF frame shows the real
 * page; the text panel is the citation.
 */
export function SourceViewer({
  documentId,
  mimeType,
  pages,
  citation,
}: {
  documentId: string;
  mimeType: string;
  pages: PageRecord[];
  citation: Citation | null;
}) {
  const markRef = useRef<HTMLElement | null>(null);
  const pageNumber = citation?.pageNumber ?? pages[0]?.pageNumber ?? 1;
  const page = pages.find((item) => item.pageNumber === pageNumber) ?? pages[0];

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [citation?.chunkId, citation?.n, pageNumber]);

  if (!page) {
    return <p className="text-sm text-muted">This document has no extracted text.</p>;
  }

  const range =
    citation && citation.pageNumber === page.pageNumber
      ? { start: citation.charStart, end: citation.charEnd }
      : null;
  const safe =
    range && range.start >= 0 && range.end <= page.text.length && range.end > range.start
      ? range
      : null;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl">Source</h2>
        <p className="text-sm text-muted">
          Page {page.pageNumber} of {pages.length}
          {citation ? ` · citation [${citation.n}]` : ""}
        </p>
      </div>
      {mimeType === "application/pdf" ? (
        <iframe
          key={`${documentId}-${page.pageNumber}`}
          title={`PDF page ${page.pageNumber}`}
          src={`/api/documents/${documentId}/file#page=${page.pageNumber}`}
          className="h-72 w-full rounded-lg border border-line bg-white"
        />
      ) : null}
      <article className="min-h-64 flex-1 overflow-auto rounded-lg border border-line bg-[#fffdf8] p-5">
        {citation && !safe ? (
          <p className="mb-3 text-xs text-[#8a2b1b]">
            Stored offsets for this citation do not fit the page text.
          </p>
        ) : null}
        <p className="whitespace-pre-wrap font-serif text-[1.02rem] leading-7 text-ink">
          {safe ? (
            <>
              {page.text.slice(0, safe.start)}
              <mark ref={markRef} className="rounded-sm bg-mark px-0.5" data-citation-mark>
                {page.text.slice(safe.start, safe.end)}
              </mark>
              {page.text.slice(safe.end)}
            </>
          ) : (
            page.text
          )}
        </p>
      </article>
      <p className="text-xs leading-5 text-muted">
        The yellow span is the cited sentence when that sentence is inside the retrieved chunk,
        otherwise the whole chunk. Offsets are the ones stored at ingest. The PDF pane is the
        original page in the browser viewer.
      </p>
    </div>
  );
}
