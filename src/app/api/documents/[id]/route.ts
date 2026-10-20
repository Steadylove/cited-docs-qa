import { NextResponse } from "next/server";
import { getApp } from "@/lib/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { config, store } = getApp();
  const detail = await store.getDocument(config.workspaceId, id);
  if (!detail) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json(detail);
}
