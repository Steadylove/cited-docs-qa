import type { PublicConfig, Spend } from "@/lib/types";
import { formatTracked, formatUsd } from "@/lib/cost";

export function ModeBanner({ config, spend }: { config: PublicConfig; spend?: Spend }) {
  const local = config.storageDriver === "memory";
  return (
    <div className={config.demo ? "bg-ink text-paper" : "bg-[#e7f2ec] text-ink"}>
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold">{config.demo ? "Demo mode" : "Live models"}</span>
          <span className="mx-2 opacity-50">·</span>
          chat {config.chatProvider}/{config.chatModel}
          <span className="mx-2 opacity-50">·</span>
          embeddings {config.embeddingProvider}/{config.embeddingModel}
          <span className="mx-2 opacity-50">·</span>
          {local ? "local file store (no Supabase)" : "Supabase"}
          {config.hybridSearch ? "" : " · vector only"}
        </p>
        {spend ? (
          <p className="tabular-nums">
            Workspace spend {formatTracked(spend.billedUsd, spend.billedCny)}
            {config.demo ? ` · illustrative ${formatUsd(spend.illustrativeUsd)}` : ""}
          </p>
        ) : null}
      </div>
      {config.demo ? (
        <p className="mx-auto max-w-6xl px-5 pb-3 text-xs text-[#d7ddd8]">
          Answers are sentences copied from retrieved passages. Embeddings are a local hash, not
          OpenAI. Tracked spend stays at $0. The illustrative figure is what gpt-4o-mini would have
          cost for the same token counts.
        </p>
      ) : null}
      {config.notes.length > 0 ? (
        <ul className="mx-auto max-w-6xl list-disc px-9 pb-3 text-xs opacity-80">
          {config.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
