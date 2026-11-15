import { getSessionUser } from "@/lib/session";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const attachment = await one<{
    original_name: string;
    mime_type: string;
    storage_path: string;
  }>(
    `SELECT a.original_name, a.mime_type, a.storage_path FROM evidence_attachments a
     JOIN evidence e ON e.id = a.evidence_id
     JOIN institutions i ON i.id = e.institution_id
     WHERE a.id = $1`,
    [Number(id)],
  );
  if (!attachment) return new Response("Not found", { status: 404 });
  if (user.profile_role === "partner") return new Response("Forbidden", { status: 403 });

  const blob = await one<{ content: Buffer }>("SELECT content FROM evidence_blobs WHERE storage_path = $1", [
    attachment.storage_path,
  ]);
  if (!blob) return new Response("File content unavailable", { status: 404 });

  return new Response(new Uint8Array(blob.content), {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Disposition": `inline; filename="${attachment.original_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
