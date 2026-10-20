import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";
import { DEMO_WORKSPACE_ID } from "@/lib/constants";

describe("loadConfig", () => {
  it("runs fully offline when no keys are set", () => {
    const config = loadConfig({});
    expect(config.chatProvider).toBe("demo");
    expect(config.embeddingProvider).toBe("demo");
    expect(config.storageDriver).toBe("memory");
    expect(config.demo).toBe(true);
    expect(config.workspaceId).toBe(DEMO_WORKSPACE_ID);
    expect(config.openAiApiKey).toBeUndefined();
  });

  it("uses OpenAI embeddings with Anthropic chat when both keys exist", () => {
    const config = loadConfig({
      CHAT_PROVIDER: "anthropic",
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "ant-test",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    });
    expect(config.chatProvider).toBe("anthropic");
    expect(config.embeddingProvider).toBe("openai");
    expect(config.storageDriver).toBe("supabase");
    expect(config.demo).toBe(false);
  });
});
