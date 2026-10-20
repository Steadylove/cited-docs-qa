import type {
  ChatProviderId,
  EmbeddingProviderId,
  PublicConfig,
  StorageDriver,
} from "@/lib/types";

export type AppConfig = PublicConfig & {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
};

export type { ChatProviderId, EmbeddingProviderId, StorageDriver };
