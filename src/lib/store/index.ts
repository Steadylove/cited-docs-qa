import path from "node:path";
import type { AppConfig } from "@/lib/config-types";
import { MemoryStore } from "@/lib/store/memory";
import { SupabaseStore } from "@/lib/store/supabase";
import type { DocumentStore } from "@/lib/store/types";

const globalStore = globalThis as unknown as {
  __citedStore?: { driver: string; store: DocumentStore };
};

export function getStore(config: AppConfig): DocumentStore {
  const driver = config.storageDriver;
  if (globalStore.__citedStore?.driver === driver) return globalStore.__citedStore.store;
  const store =
    driver === "supabase"
      ? new SupabaseStore(config.supabaseUrl ?? "", config.supabaseServiceRoleKey ?? "")
      : new MemoryStore({ filePath: path.join(process.cwd(), ".data", "store.json") });
  globalStore.__citedStore = { driver, store };
  return store;
}

export type { DocumentStore } from "@/lib/store/types";
