import { sql } from "@/server/db";

export async function GET() {
  try {
    await sql`select 1 as ok`;
    return Response.json({ ok: true, database: "up" });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";
