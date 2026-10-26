import { sql } from "@/server/db";
import { purgeStoredFiles } from "@/server/data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }
  const rows = await sql<{ storage_key: string }[]>`select * from app.purge_due_organizations()`;
  await purgeStoredFiles(rows.map((row) => row.storage_key));
  const reminders = await sql<{ enqueue_appointment_reminders: number }[]>`select app.enqueue_appointment_reminders() as enqueue_appointment_reminders`;
  return Response.json({ purgedFiles: rows.length, reminders: reminders[0]?.enqueue_appointment_reminders ?? 0 });
}
