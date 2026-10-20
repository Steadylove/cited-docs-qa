import { loadConfig, toPublicConfig } from "@/lib/config";
import { getChatStreamer, getEmbedder } from "@/lib/providers";
import { getStore } from "@/lib/store";

export function getApp() {
  const config = loadConfig();
  return {
    config,
    publicConfig: toPublicConfig(config),
    store: getStore(config),
    embedder: getEmbedder(config),
    chat: getChatStreamer(config),
  };
}
