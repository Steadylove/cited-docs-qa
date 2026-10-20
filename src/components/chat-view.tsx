"use client";

import { useMemo, useState } from "react";
import { AnswerText } from "@/components/answer-text";
import { ModeBanner } from "@/components/mode-banner";
import { SourceViewer } from "@/components/source-viewer";
import { formatTracked, formatUsd } from "@/lib/cost";
import { SAMPLE_FILENAME, SAMPLE_QUESTIONS } from "@/lib/constants";
import type { ChatMessage, Citation, DocumentDetail, PublicConfig, Spend } from "@/lib/types";

export function ChatView({
  config,
  detail,
  initialSpend,
}: {
  config: PublicConfig;
  detail: DocumentDetail;
  initialSpend: Spend;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(detail.messages);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Citation | null>(null);
  const [docSpend, setDocSpend] = useState<Spend>({
    billedUsd: detail.document.totalCostUsd,
    billedCny: detail.document.totalCostCny,
    illustrativeUsd: detail.document.illustrativeCostUsd,
  });
  const [workspaceSpend, setWorkspaceSpend] = useState(initialSpend);

  const suggestions = useMemo(
    () => (detail.document.filename === SAMPLE_FILENAME ? SAMPLE_QUESTIONS : []),
    [detail.document.filename],
  );

  function focusCitation(message: ChatMessage, n: number) {
    const citation = message.citations.find((item) => item.n === n) ?? null;
    setActive(citation);
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setQuestion("");
    const draftId = `draft-${Date.now()}`;
    const userDraft: ChatMessage = {
      id: `${draftId}-user`,
      documentId: detail.document.id,
      role: "user",
      content: trimmed,
      citations: [],
      droppedCitations: [],
      retrieved: [],
      promptTokens: 0,
      completionTokens: 0,
      embeddingTokens: 0,
      estimatedCostUsd: 0,
      estimatedCostCny: 0,
      unpricedModels: [],
      unverifiedModels: [],
      illustrativeCostUsd: 0,
      refused: false,
      partial: false,
      createdAt: new Date().toISOString(),
    };
    const assistantDraft: ChatMessage = { ...userDraft, id: `${draftId}-assistant`, role: "assistant", content: "" };
    setMessages((current) => [...current, userDraft, assistantDraft]);

    try {
      const response = await fetch(`/api/documents/${detail.document.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!response.ok || !response.body) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Question failed.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const event = readEvent(part);
          if (!event) continue;
          if (event.event === "token") {
            acc += String(event.data.text ?? "");
            const next = acc;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantDraft.id ? { ...message, content: next } : message,
              ),
            );
          } else if (event.event === "replace") {
            acc = String(event.data.text ?? "");
            const next = acc;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantDraft.id ? { ...message, content: next } : message,
              ),
            );
          } else if (event.event === "done") {
            const message = event.data.message as ChatMessage;
            setMessages((current) =>
              current.map((item) => (item.id === assistantDraft.id ? message : item)),
            );
            setDocSpend(event.data.documentSpend as Spend);
            setWorkspaceSpend(event.data.workspaceSpend as Spend);
            const first = message.citations[0] ?? null;
            if (first) setActive(first);
          } else if (event.event === "error") {
            throw new Error(String(event.data.message ?? "Question failed."));
          }
        }
      }
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== assistantDraft.id));
      setError(err instanceof Error ? err.message : "Question failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <ModeBanner config={config} spend={workspaceSpend} />
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-2">
        <section className="flex min-h-[70vh] flex-col">
          <header className="mb-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Document</p>
            <h1 className="font-serif text-3xl leading-tight">{detail.document.filename}</h1>
            <p className="mt-1 text-sm text-muted">
              {detail.document.pageCount} pages · {detail.document.chunkCount} chunks · tracked{" "}
              {formatTracked(docSpend.billedUsd, docSpend.billedCny)}
              {config.demo ? ` · illustrative ${formatUsd(docSpend.illustrativeUsd)}` : ""}
            </p>
          </header>

          <div className="flex flex-1 flex-col gap-4">
            {messages.length === 0 ? (
              <p className="text-sm leading-6 text-muted">
                Ask something this file can answer. If the evidence is not there, the reply should
                refuse instead of guessing.
              </p>
            ) : null}
            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-8" : ""}>
                <p className="mb-1 text-xs uppercase tracking-[0.14em] text-muted">
                  {message.role === "user" ? "You" : "Cited"}
                </p>
                {message.role === "assistant" ? (
                  <div
                    className={
                      message.refused || message.partial
                        ? "rounded-xl border border-[#e4d3a1] bg-[#fff8e8] p-4"
                        : "rounded-xl border border-line bg-white/80 p-4"
                    }
                  >
                    {message.partial ? (
                      <p className="mb-2 text-xs font-medium text-[#8a5a12]">
                        Partially answered. Part of the question is not in the sources.
                      </p>
                    ) : null}
                    <AnswerText text={message.content || (busy ? "…" : "")} onCite={(n) => focusCitation(message, n)} />
                    {message.droppedCitations.length > 0 ? (
                      <p className="mt-2 text-xs text-[#8a2b1b]">
                        Removed citation markers that were not in the retrieved set:{" "}
                        {message.droppedCitations.map((n) => `[${n}]`).join(" ")}
                      </p>
                    ) : null}
                    {message.promptTokens + message.completionTokens + message.embeddingTokens > 0 ? (
                      <p className="mt-3 text-xs tabular-nums text-muted">
                        {message.promptTokens} prompt tokens · {message.completionTokens} completion
                        tokens · {message.embeddingTokens} embedding tokens ·{" "}
                        {config.demo
                          ? `${formatUsd(message.illustrativeCostUsd)} illustrative, not billed`
                          : `${formatTracked(message.estimatedCostUsd, message.estimatedCostCny)} estimated`}
                        {message.unpricedModels.length > 0
                          ? ` · unpriced: ${message.unpricedModels.join(", ")} (no rate, not estimated)`
                          : ""}
                        {message.unverifiedModels.length > 0
                          ? ` · unverified rate: ${message.unverifiedModels.join(", ")}`
                          : ""}
                      </p>
                    ) : null}
                    {message.retrieved.length > 0 ? (
                      <details className="mt-3 text-xs text-muted">
                        <summary className="cursor-pointer">Retrieved passages</summary>
                        <p className="mt-2">
                          Hybrid order uses the fused rank score. Vector-only search shows cosine
                          similarity. The two numbers are not the same scale.
                        </p>
                        <ul className="mt-2 space-y-2">
                          {message.retrieved.map((passage) => (
                            <li key={passage.chunkId}>
                              <span className="font-medium text-ink">[{passage.n}]</span> page{" "}
                              {passage.pageNumber} · {scoreLabel(passage)}
                              <span className="mt-0.5 block">{passage.preview}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl bg-ink px-4 py-3 text-sm text-paper">{message.content}</p>
                )}
              </article>
            ))}
          </div>

          {suggestions.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy}
                  onClick={() => void ask(suggestion)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs text-ink hover:border-pine disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label className="sr-only" htmlFor="question">
              Question
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask(question);
                }
              }}
              rows={3}
              placeholder="Ask about this document"
              className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              {error ? <p className="text-sm text-[#8a2b1b]">{error}</p> : <span />}
              <button
                type="submit"
                disabled={busy || question.trim().length === 0}
                className="rounded-full bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Answering…" : "Ask"}
              </button>
            </div>
          </form>
        </section>

        <section className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <SourceViewer
            documentId={detail.document.id}
            mimeType={detail.document.mimeType}
            pages={detail.pages}
            citation={active}
          />
        </section>
      </div>
    </main>
  );
}

function scoreLabel(passage: { scoreKind?: string; score: number }): string {
  if (passage.scoreKind === "fused") return `fused ${passage.score}`;
  if (passage.scoreKind === "vector") return `vector ${passage.score}`;
  return `score ${passage.score}`;
}

function readEvent(block: string): { event: string; data: Record<string, unknown> } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) as Record<string, unknown> };
}
