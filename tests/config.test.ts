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
    expect(config.deepseekBaseUrl).toBe("https://api.deepseek.com");
    expect(config.siliconflowBaseUrl).toBe("https://api.siliconflow.cn/v1");
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

  it("picks DeepSeek and SiliconFlow from keys alone", () => {
    const config = loadConfig({
      DEEPSEEK_API_KEY: "ds-test",
      SILICONFLOW_API_KEY: "sf-test",
    });
    expect(config.chatProvider).toBe("deepseek");
    expect(config.chatModel).toBe("deepseek-flash");
    expect(config.embeddingProvider).toBe("siliconflow");
    expect(config.embeddingModel).toBe("BAAI/bge-m3");
    expect(config.demo).toBe(false);
  });

  it("falls back to demo when the recommended providers have empty keys", () => {
    const config = loadConfig({
      CHAT_PROVIDER: "deepseek",
      EMBEDDING_PROVIDER: "siliconflow",
      DEEPSEEK_CHAT_MODEL: "deepseek-flash",
    });
    expect(config.chatProvider).toBe("demo");
    expect(config.embeddingProvider).toBe("demo");
    expect(config.demo).toBe(true);
    expect(config.notes.join(" ")).toContain("DEEPSEEK_API_KEY");
    expect(config.notes.join(" ")).toContain("SILICONFLOW_API_KEY");
  });

  it("switches to OpenAI from the provider env vars", () => {
    const config = loadConfig({
      CHAT_PROVIDER: "openai",
      EMBEDDING_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      DEEPSEEK_API_KEY: "ds-test",
      SILICONFLOW_API_KEY: "sf-test",
    });
    expect(config.chatProvider).toBe("openai");
    expect(config.chatModel).toBe("gpt-4o-mini");
    expect(config.embeddingProvider).toBe("openai");
    expect(config.embeddingModel).toBe("text-embedding-3-small");
    expect(config.demo).toBe(false);
  });
});
