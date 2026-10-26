import { PageIntro } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { markRead } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { listNotifications } from "@/server/data";

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const rows = await listNotifications(ctx);
  return (
    <div>
      <PageIntro title="Alerts" lede="Email is sent only when mail is configured. These alerts stay here either way." action={
        <form action={markRead}>
          <input type="hidden" name="slug" value={slug} />
          <button className="btn-secondary">Mark all read</button>
        </form>
      } />
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={String(row.id)} className="card">
            <p className="font-bold">{String(row.title)}{row.read_at ? "" : " · new"}</p>
            <p>{String(row.body)}</p>
            <p className="text-sm text-ink/60">{formatWhen(row.created_at as string | Date, ctx.timezone)}</p>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="card">No alerts yet.</p> : null}
    </div>
  );
}
