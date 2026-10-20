import { NextResponse } from "next/server";
import { getApp } from "@/lib/app";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { ingestFile } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { config, store } = getApp();
  await store.ensureWorkspace({
    id: config.workspaceId,
    name: config.workspaceName,
    ownerId: config.ownerId,
  });
  const documents = await store.listDocuments(config.workspaceId);
  const spend = await store.workspaceSpend(config.workspaceId);
  return NextResponse.json({ documents, spend });
}

export async function POST(request: Request) {
  const { config, store, embedder } = getApp();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a PDF, .txt, or .md file." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Files must be 8 MB or smaller." }, { status: 400 });
  }
  const filename = file.name || "document";
  if (!/\.(pdf|txt|md)$/i.test(filename)) {
    return NextResponse.json({ error: "Upload a PDF, .txt, or .md file." }, { status: 400 });
  }

  try {
    await store.ensureWorkspace({
      id: config.workspaceId,
      name: config.workspaceName,
      ownerId: config.ownerId,
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await ingestFile({
      store,
      embedder,
      workspaceId: config.workspaceId,
      filename,
      bytes,
    });
    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
