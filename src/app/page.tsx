import { HomeScreen } from "@/components/home-screen";
import { getApp } from "@/lib/app";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { config, publicConfig, store } = getApp();
  await store.ensureWorkspace({
    id: config.workspaceId,
    name: config.workspaceName,
    ownerId: config.ownerId,
  });
  const documents = await store.listDocuments(config.workspaceId);
  const spend = await store.workspaceSpend(config.workspaceId);
  return <HomeScreen config={publicConfig} documents={documents} spend={spend} />;
}
