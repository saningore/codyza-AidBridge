import { verifyFileSignature } from "@/lib/tokens";
import { getSession, listMyOrgs, loadOrg } from "@/server/context";
import { readDocument } from "@/server/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!verifyFileSignature(token, id)) return new Response("Not found", { status: 404 });
  const session = await getSession();
  if (!session || session.scope !== "full") return new Response("Not found", { status: 404 });
  const orgs = await listMyOrgs(session.userId);
  for (const org of orgs) {
    const loaded = await loadOrg(org.slug);
    if (!loaded || loaded === "login" || loaded === "mfa") continue;
    const file = await readDocument(loaded, id);
    if (!file) continue;
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.mime,
        "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
      },
    });
  }
  return new Response("Not found", { status: 404 });
}
