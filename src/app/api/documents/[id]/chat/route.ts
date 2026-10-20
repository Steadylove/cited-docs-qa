import { NextResponse } from "next/server";
import { getApp } from "@/lib/app";
import { askDocument } from "@/lib/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Enter a question." }, { status: 400 });
  if (question.length > 2000) {
    return NextResponse.json({ error: "Question is too long (2000 characters)." }, { status: 400 });
  }

  const { config, store, embedder, chat } = getApp();
  const detail = await store.getDocument(config.workspaceId, id);
  if (!detail) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for await (const item of askDocument({
          store,
          embedder,
          chat,
          workspaceId: config.workspaceId,
          documentId: id,
          question,
          hybrid: config.hybridSearch,
        })) {
          if (item.type === "token") send("token", { text: item.text });
          else if (item.type === "replace") send("replace", { text: item.text });
          else send("done", item);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Question failed.";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
