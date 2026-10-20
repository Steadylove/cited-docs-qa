import { readFileSync } from "node:fs";
import path from "node:path";
import { askDocument } from "../src/lib/ask";
import { loadConfig } from "../src/lib/config";
import { ingestFile } from "../src/lib/ingest";
import { getEmbedder } from "../src/lib/providers";
import { MemoryStore } from "../src/lib/store/memory";
import type { Citation } from "../src/lib/types";

type EvalCase = {
  id: string;
  question: string;
  expectPage?: number;
  expectSnippet?: string;
  expectRefusal?: boolean;
};

const config = loadConfig({
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
  const pdf = new Uint8Array(
    readFileSync(path.join(process.cwd(), "fixtures", "harbor-pine-handbook.pdf")),
  );
  const cases = JSON.parse(
    readFileSync(path.join(process.cwd(), "fixtures", "eval-set.json"), "utf8"),
  ) as EvalCase[];

  const store = new MemoryStore();
  const embedder = getEmbedder(config);
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

  let hits = 0;
  const lines: string[] = [];
  for (const row of cases) {
    let answer = "";
    let citations: Citation[] = [];
    let refused = false;
    for await (const event of askDocument({
      store,
      embedder,
      chat: null,
      workspaceId: config.workspaceId,
      documentId: document.id,
      question: row.question,
      hybrid: true,
    })) {
      if (event.type === "done") {
        answer = event.message.content;
        citations = event.message.citations;
        refused = event.message.refused;
      }
    }

    let ok = false;
    let detailText = "";
    if (row.expectRefusal) {
      ok = refused && citations.length === 0;
      detailText = refused ? "refused" : `answered: ${answer}`;
    } else {
      const matched = citations.filter((citation) => {
        return (
          citation.pageNumber === row.expectPage &&
          passage(detail.pages, citation).includes(row.expectSnippet ?? "")
        );
      });
      ok = matched.length > 0;
      detailText = citations
        .map((citation) => `[${citation.n}] p${citation.pageNumber}`)
        .join(" ") || "(no citations)";
    }

    if (ok) hits += 1;
    lines.push(`${ok ? "ok  " : "MISS"} ${row.id.padEnd(12)} ${detailText}`);
    if (!ok) lines.push(`      answer: ${answer}`);
  }

  const accuracy = hits / cases.length;
  console.log(lines.join("\n"));
  console.log(`\n${hits}/${cases.length} citation accuracy ${(accuracy * 100).toFixed(1)}%`);
  if (accuracy < 1) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
