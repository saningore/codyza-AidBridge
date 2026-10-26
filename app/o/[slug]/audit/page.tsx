import { notFound } from "next/navigation";
import { PageIntro } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { requireOrg } from "@/server/context";
import { listAudit } from "@/server/data";

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  if (!ctx.can("audit.read")) notFound();
  const rows = await listAudit(ctx);
  return (
    <div>
      <PageIntro title="Audit" lede="Meaningful changes are appended. This list does not include note text." />
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={String(row.id)} className="card">
            {formatWhen(row.created_at as string | Date, ctx.timezone)} · {String(row.actor ?? "System")} · {String(row.entity_type)} · {String(row.action)}
            {row.code ? ` · ${String(row.code)}` : ""}
            {row.before_status ? ` · ${String(row.before_status)} to ${String(row.after_status)}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
