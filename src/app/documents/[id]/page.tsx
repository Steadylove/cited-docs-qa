import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat-view";
import { getApp } from "@/lib/app";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { config, publicConfig, store } = getApp();
  const detail = await store.getDocument(config.workspaceId, id);
  if (!detail) notFound();
  const spend = await store.workspaceSpend(config.workspaceId);
  return <ChatView config={publicConfig} detail={detail} initialSpend={spend} />;
}
