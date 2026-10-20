import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getApp } from "@/lib/app";
import { SAMPLE_FILENAME } from "@/lib/constants";
import { ingestFile } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const { config, store, embedder } = getApp();
  try {
    const bytes = new Uint8Array(
      await readFile(path.join(process.cwd(), "fixtures", SAMPLE_FILENAME)),
    );
    await store.ensureWorkspace({
      id: config.workspaceId,
      name: config.workspaceName,
      ownerId: config.ownerId,
    });
    const document = await ingestFile({
      store,
      embedder,
      workspaceId: config.workspaceId,
      filename: SAMPLE_FILENAME,
      bytes,
    });
    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the sample.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
