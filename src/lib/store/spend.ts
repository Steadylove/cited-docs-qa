import { summarizeUsage, type UsageLike } from "@/lib/cost";
import type { Spend } from "@/lib/types";

export type StoredUsage = UsageLike & {
  id: string;
  workspaceId: string;
  documentId: string | null;
  provider: string;
  model: string;
};

export function spendFor(
  events: StoredUsage[],
  filter: (event: StoredUsage) => boolean,
): Spend {
  const summary = summarizeUsage(events.filter(filter));
  return { billedUsd: summary.billedUsd, illustrativeUsd: summary.illustrativeUsd };
}
