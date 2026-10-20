import {
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_SILICONFLOW_EMBEDDING_MODEL,
  DEMO_WORKSPACE_ID,
  DEEPSEEK_BASE_URL,
  SILICONFLOW_BASE_URL,
} from "@/lib/constants";
import type { AppConfig } from "@/lib/config-types";
import type {
  ChatProviderId,
  EmbeddingProviderId,
  PublicConfig,
  StorageDriver,
} from "@/lib/types";

export type { AppConfig } from "@/lib/config-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve providers from the environment.
 * Missing keys fall back to demo mode instead of crashing, and the notes
 * array is shown in the UI so the fallback is not silent.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const notes: string[] = [];
  const openAiApiKey = clean(env.OPENAI_API_KEY);
  const anthropicApiKey = clean(env.ANTHROPIC_API_KEY);
  const deepseekApiKey = clean(env.DEEPSEEK_API_KEY);
  const siliconflowApiKey = clean(env.SILICONFLOW_API_KEY);
  const deepseekBaseUrl = clean(env.DEEPSEEK_BASE_URL) ?? DEEPSEEK_BASE_URL;
  const siliconflowBaseUrl = clean(env.SILICONFLOW_BASE_URL) ?? SILICONFLOW_BASE_URL;
  const supabaseUrl = clean(env.SUPABASE_URL);
  const supabaseServiceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);

  const chatRequested = clean(env.CHAT_PROVIDER);
  let chatProvider = (chatRequested ??
    (deepseekApiKey ? "deepseek" : openAiApiKey ? "openai" : "demo")) as ChatProviderId;
  if (!["deepseek", "openai", "anthropic", "demo"].includes(chatProvider)) {
    notes.push(`Unknown CHAT_PROVIDER "${chatProvider}". Using demo chat.`);
    chatProvider = "demo";
  }
  if (chatProvider === "deepseek" && !deepseekApiKey) {
    notes.push("CHAT_PROVIDER=deepseek but DEEPSEEK_API_KEY is empty. Using demo chat.");
    chatProvider = "demo";
  }
  if (chatProvider === "openai" && !openAiApiKey) {
    notes.push("CHAT_PROVIDER=openai but OPENAI_API_KEY is empty. Using demo chat.");
    chatProvider = "demo";
  }
  if (chatProvider === "anthropic" && !anthropicApiKey) {
    notes.push(
      "CHAT_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty. Using demo chat.",
    );
    chatProvider = "demo";
  }

  const embeddingRequested = clean(env.EMBEDDING_PROVIDER);
  let embeddingProvider: EmbeddingProviderId;
  if (embeddingRequested === "demo") {
    embeddingProvider = "demo";
  } else if (embeddingRequested === "siliconflow") {
    embeddingProvider = siliconflowApiKey ? "siliconflow" : "demo";
    if (!siliconflowApiKey) {
      notes.push(
        "EMBEDDING_PROVIDER=siliconflow but SILICONFLOW_API_KEY is empty. Using demo embeddings.",
      );
    }
  } else if (embeddingRequested === "openai") {
    embeddingProvider = openAiApiKey ? "openai" : "demo";
    if (!openAiApiKey) {
      notes.push(
        "EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is empty. Using demo embeddings.",
      );
    }
  } else if (embeddingRequested) {
    notes.push(
      `Unknown EMBEDDING_PROVIDER "${embeddingRequested}". Using demo embeddings.`,
    );
    embeddingProvider = "demo";
  } else if (chatProvider === "demo") {
    // No live chat. Keep vectors in the demo space so a later key does not
    // mix with passages already stored.
    embeddingProvider = "demo";
  } else if (chatProvider === "deepseek" && siliconflowApiKey) {
    embeddingProvider = "siliconflow";
  } else if (openAiApiKey) {
    embeddingProvider = "openai";
  } else if (siliconflowApiKey) {
    embeddingProvider = "siliconflow";
  } else {
    notes.push("No embedding API key. Using demo embeddings.");
    embeddingProvider = "demo";
  }

  const storageRequested = clean(env.STORAGE_DRIVER);
  let storageDriver: StorageDriver;
  const supabaseReady = Boolean(supabaseUrl && supabaseServiceRoleKey);
  if (storageRequested === "memory") {
    storageDriver = "memory";
  } else if (storageRequested === "supabase") {
    storageDriver = supabaseReady ? "supabase" : "memory";
    if (!supabaseReady) {
      notes.push(
        "STORAGE_DRIVER=supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is empty. Using the local store.",
      );
    }
  } else if (storageRequested) {
    notes.push(`Unknown STORAGE_DRIVER "${storageRequested}". Using the local store.`);
    storageDriver = "memory";
  } else {
    storageDriver = supabaseReady ? "supabase" : "memory";
  }

  let workspaceId = clean(env.WORKSPACE_ID) ?? DEMO_WORKSPACE_ID;
  if (!UUID_RE.test(workspaceId)) {
    notes.push(`WORKSPACE_ID must be a UUID. Using ${DEMO_WORKSPACE_ID}.`);
    workspaceId = DEMO_WORKSPACE_ID;
  }

  const chatModel =
    chatProvider === "deepseek"
      ? (clean(env.DEEPSEEK_CHAT_MODEL) ?? DEFAULT_DEEPSEEK_MODEL)
      : chatProvider === "anthropic"
        ? (clean(env.ANTHROPIC_CHAT_MODEL) ?? "claude-3-5-haiku-latest")
        : chatProvider === "openai"
          ? (clean(env.OPENAI_CHAT_MODEL) ?? "gpt-4o-mini")
          : "demo-extractive";

  const embeddingModel =
    embeddingProvider === "siliconflow"
      ? (clean(env.SILICONFLOW_EMBEDDING_MODEL) ?? DEFAULT_SILICONFLOW_EMBEDDING_MODEL)
      : embeddingProvider === "openai"
        ? (clean(env.OPENAI_EMBEDDING_MODEL) ?? "text-embedding-3-small")
        : "demo-hash";

  return {
    chatProvider,
    chatModel,
    embeddingProvider,
    embeddingModel,
    storageDriver,
    hybridSearch: clean(env.HYBRID_SEARCH) !== "false",
    demo: chatProvider === "demo" || embeddingProvider === "demo",
    notes,
    workspaceId,
    workspaceName: clean(env.WORKSPACE_NAME) ?? "Local workspace",
    ownerId: clean(env.OWNER_ID) ?? "local-owner",
    openAiApiKey,
    anthropicApiKey,
    deepseekApiKey,
    siliconflowApiKey,
    deepseekBaseUrl,
    siliconflowBaseUrl,
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}

export function toPublicConfig(config: AppConfig): PublicConfig {
  return {
    chatProvider: config.chatProvider,
    chatModel: config.chatModel,
    embeddingProvider: config.embeddingProvider,
    embeddingModel: config.embeddingModel,
    storageDriver: config.storageDriver,
    hybridSearch: config.hybridSearch,
    demo: config.demo,
    notes: config.notes,
  };
}
