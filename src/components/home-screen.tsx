"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModeBanner } from "@/components/mode-banner";
import { formatTracked, formatUsd } from "@/lib/cost";
import type { DocumentSummary, PublicConfig, Spend } from "@/lib/types";

export function HomeScreen({
  config,
  documents,
  spend,
}: {
  config: PublicConfig;
  documents: DocumentSummary[];
  spend: Spend;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy("Reading pages, chunking, and embedding…");
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/documents", { method: "POST", body });
    const json = (await response.json()) as { document?: { id: string }; error?: string };
    if (!response.ok || !json.document) {
      setBusy(null);
      setError(json.error ?? "Upload failed.");
      return;
    }
    router.push(`/documents/${json.document.id}`);
  }

  async function loadSample() {
    setBusy("Loading the sample handbook…");
    setError(null);
    const response = await fetch("/api/documents/sample", { method: "POST" });
    const json = (await response.json()) as { document?: { id: string }; error?: string };
    if (!response.ok || !json.document) {
      setBusy(null);
      setError(json.error ?? "Could not load the sample.");
      return;
    }
    router.push(`/documents/${json.document.id}`);
  }

  return (
    <main>
      <ModeBanner config={config} spend={spend} />
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-line bg-white/70 p-6 shadow-[0_1px_0_rgba(28,36,33,0.04)]">
          <h1 className="font-serif text-4xl leading-tight tracking-tight">
            Answers you can point at.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted">
            Upload a PDF or a text file, ask a question, and every claim comes back with a
            numbered citation. Click it to open that page and highlight the passage. If the file
            does not support an answer, Cited says so.
          </p>
          <label
            className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#c9bfae] bg-[#faf7f1] px-6 py-10 text-center hover:border-pine"
          >
            <span className="font-medium">Drop a PDF, .txt, or .md</span>
            <span className="mt-1 text-sm text-muted">8 MB maximum</span>
            <input
              className="sr-only"
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadSample()}
              disabled={busy !== null}
              className="rounded-full bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Try the sample handbook
            </button>
            {busy ? <span className="text-sm text-muted">{busy}</span> : null}
          </div>
          {error ? <p className="mt-3 text-sm text-[#8a2b1b]">{error}</p> : null}
        </section>

        <section className="flex flex-col justify-between gap-6">
          <ol className="space-y-4 text-sm leading-6">
            <li>
              <span className="font-semibold">1. Upload.</span> Each page is extracted, then cut
              into overlapping passages that remember their page and character offsets.
            </li>
            <li>
              <span className="font-semibold">2. Ask.</span> The closest passages are numbered in
              the prompt. The model may only cite those numbers.
            </li>
            <li>
              <span className="font-semibold">3. Check.</span> The server drops any citation that
              was not retrieved. [1] opens the page and highlights that span.
            </li>
          </ol>
          <p className="text-xs leading-5 text-muted">
            {config.storageDriver === "memory"
              ? "Documents for this workspace live in .data/store.json on this machine."
              : "Documents for this workspace live in Supabase."}{" "}
            Workspace id is stored on every row so a second tenant is a filter, not a rewrite.
          </p>
        </section>
      </div>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-serif text-2xl">Documents</h2>
        {documents.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing uploaded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white/80">
            {documents.map((document) => (
              <li key={document.id}>
                <a
                  href={`/documents/${document.id}`}
                  className="flex flex-col gap-2 px-4 py-4 hover:bg-[#faf7f1] sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="font-medium">{document.filename}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {document.pageCount} pages · {document.chunkCount} chunks · indexed with{" "}
                      {document.embeddingModel}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    {formatTracked(document.totalCostUsd, document.totalCostCny)} tracked
                    {config.demo ? ` · ${formatUsd(document.illustrativeCostUsd)} illustrative` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
