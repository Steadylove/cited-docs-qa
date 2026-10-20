import { getApp } from "@/lib/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { config, store } = getApp();
  const file = await store.getFile(config.workspaceId, id);
  if (!file) return new Response("Not found", { status: 404 });
  const filename = file.filename.replace(/["\r\n]/g, "");
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
