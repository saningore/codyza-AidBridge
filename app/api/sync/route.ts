import { loadOrg } from "@/server/context";
import { applyOfflineMutation, fieldSnapshot } from "@/server/data";

export const dynamic = "force-dynamic";

async function context(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const loaded = await loadOrg(slug);
  if (!loaded || loaded === "login" || loaded === "mfa") return null;
  return loaded;
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if (!ctx) return Response.json({ error: "Sign in again." }, { status: 401 });
  return Response.json(await fieldSnapshot(ctx));
}

export async function POST(request: Request) {
  const ctx = await context(request);
  if (!ctx) return Response.json({ error: "Sign in again." }, { status: 401 });
  const body = (await request.json()) as {
    mutations?: { idempotencyKey: string; kind: string; payload: Record<string, unknown> }[];
  };
  const applied: string[] = [];
  const results = [];
  for (const mutation of body.mutations ?? []) {
    const result = await applyOfflineMutation(ctx, mutation);
    applied.push(mutation.idempotencyKey);
    results.push({ idempotencyKey: mutation.idempotencyKey, ...result });
  }
  return Response.json({ applied, results });
}
