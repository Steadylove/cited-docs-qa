import { readFileSync } from "node:fs";
import path from "node:path";
import { askDocument } from "../src/lib/ask";
import { loadConfig } from "../src/lib/config";
import { formatCny, formatUsd } from "../src/lib/cost";
import { ingestFile } from "../src/lib/ingest";
import { getChatStreamer, getEmbedder } from "../src/lib/providers";
import { MemoryStore } from "../src/lib/store/memory";
import type { Citation } from "../src/lib/types";

type EvalCase = {
  id: string;
  question: string;
  expectPage?: number;
  expectSnippet?: string;
  expectRefusal?: boolean;
};

const live = process.env.EVAL_LIVE === "1";
const config = live
  ? loadConfig()
  : loadConfig({
      CHAT_PROVIDER: "demo",
      EMBEDDING_PROVIDER: "demo",
      STORAGE_DRIVER: "memory",
    });

function passage(pages: { pageNumber: number; text: string }[], citation: Citation): string {
  const page = pages.find((item) => item.pageNumber === citation.pageNumber);
  if (!page) return "";
  return page.text.slice(citation.charStart, citation.charEnd);
}

async function main() {
  if (live && (config.chatProvider === "demo" || config.embeddingProvider === "demo")) {
    console.error("EVAL_LIVE=1 needs a real chat provider and a real embedding provider.");
    for (const note of config.notes) console.error(note);
    process.exit(1);
  }

  const pdf = new Uint8Array(
    readFileSync(path.join(process.cwd(), "fixtures", "harbor-pine-handbook.pdf")),
  );
  const cases = JSON.parse(
    readFileSync(path.join(process.cwd(), "fixtures", "eval-set.json"), "utf8"),
  ) as EvalCase[];

  // The handbook stays in a private memory store so a live run does not
  // write the fixture into Supabase. Providers still come from the env.
  const store = new MemoryStore();
  const embedder = getEmbedder(config);
  const chat = live ? getChatStreamer(config) : null;
  await store.ensureWorkspace({
    id: config.workspaceId,
    name: config.workspaceName,
    ownerId: config.ownerId,
  });
  const document = await ingestFile({
    store,
    embedder,
    workspaceId: config.workspaceId,
    filename: "harbor-pine-handbook.pdf",
    bytes: pdf,
  });
  const detail = await store.getDocument(config.workspaceId, document.id);
  if (!detail) throw new Error("Ingested document disappeared.");

  if (live) {
    console.log(
      `live chat ${config.chatProvider}/${config.chatModel} · embeddings ${config.embeddingProvider}/${config.embeddingModel}`,
    );
  }

  let citationHits = 0;
  let citationCases = 0;
  let refusalHits = 0;
  let refusalCases = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let embedTokens = 0;
  const lines: string[] = [];

  for (const row of cases) {
    let answer = "";
    let citations: Citation[] = [];
    let refused = false;
    let partial = false;
    let rowPrompt = 0;
    let rowCompletion = 0;
    let rowEmbed = 0;
    let rowUsd = 0;
    let rowCny = 0;
    const unpriced: string[] = [];
    for await (const event of askDocument({
      store,
      embedder,
      chat,
      workspaceId: config.workspaceId,
      documentId: document.id,
      question: row.question,
      hybrid: config.hybridSearch,
    })) {
      if (event.type === "done") {
        answer = event.message.content;
        citations = event.message.citations;
        refused = event.message.refused;
        partial = event.message.partial;
        rowPrompt = event.message.promptTokens;
        rowCompletion = event.message.completionTokens;
        rowEmbed = event.message.embeddingTokens;
        rowUsd = event.message.estimatedCostUsd;
        rowCny = event.message.estimatedCostCny;
        unpriced.push(...event.message.unpricedModels);
      }
    }

    promptTokens += rowPrompt;
    completionTokens += rowCompletion;
    embedTokens += rowEmbed;

    let ok = false;
    let detailText = "";
    if (row.expectRefusal) {
      refusalCases += 1;
      ok = refused && citations.length === 0 && !partial;
      if (ok) refusalHits += 1;
      detailText = refused ? "refused" : partial ? "partial" : `answered: ${answer}`;
    } else {
      citationCases += 1;
      const matched = citations.filter((citation) => {
        return (
          citation.pageNumber === row.expectPage &&
          passage(detail.pages, citation).includes(row.expectSnippet ?? "")
        );
      });
      ok = matched.length > 0;
      if (ok) citationHits += 1;
      detailText =
        citations.map((citation) => `[${citation.n}] p${citation.pageNumber}`).join(" ") ||
        "(no citations)";
      if (partial) detailText += " partial";
    }

    const cost =
      rowCny > 0 && rowUsd > 0
        ? `${formatUsd(rowUsd)}+${formatCny(rowCny)}`
        : rowCny > 0
          ? formatCny(rowCny)
          : formatUsd(rowUsd);
    lines.push(
      `${ok ? "ok  " : "MISS"} ${row.id.padEnd(12)} ${detailText} · ${rowPrompt}+${rowCompletion} tok · embed ${rowEmbed} · ${cost}${unpriced.length ? ` · unpriced ${unpriced.join(",")}` : ""}`,
    );
    if (!ok) lines.push(`      answer: ${answer}`);
  }

  const citationAccuracy = citationCases === 0 ? 1 : citationHits / citationCases;
  const refusalAccuracy = refusalCases === 0 ? 1 : refusalHits / refusalCases;
  console.log(lines.join("\n"));
  console.log(
    `\ncitation accuracy ${citationHits}/${citationCases} ${(citationAccuracy * 100).toFixed(1)}%`,
  );
  console.log(
    `refusal accuracy ${refusalHits}/${refusalCases} ${(refusalAccuracy * 100).toFixed(1)}%`,
  );
  const spend = await store.workspaceSpend(config.workspaceId);
  console.log(
    `tokens prompt ${promptTokens} · completion ${completionTokens} · question-embedding ${embedTokens}`,
  );
  console.log(
    `cost ${formatUsd(spend.billedUsd)}${spend.billedCny ? ` + ${formatCny(spend.billedCny)}` : ""} (includes indexing)`,
  );
  if (citationAccuracy < 1 || refusalAccuracy < 1) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
