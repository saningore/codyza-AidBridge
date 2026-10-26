import Link from "next/link";
import { PageIntro } from "@/components/shell";
import { STATUS_LABEL, type CaseStatus } from "@/lib/status";
import { requireOrg } from "@/server/context";
import { listCases } from "@/server/data";

export default async function CasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { slug } = await params;
  const { status = "" } = await searchParams;
  const ctx = await requireOrg(slug);
  const rows = await listCases(ctx, status);
  return (
    <div>
      <PageIntro title="Cases" lede="A short title stays on the case. The story stays in the notes." action={ctx.can("case.write") ? <Link className="btn" href={`/o/${slug}/cases/new`}>Open case</Link> : null} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="btn-secondary" href={`/o/${slug}/cases`}>All</Link>
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <Link key={key} className="btn-secondary" href={`/o/${slug}/cases?status=${key}`}>{label}</Link>
        ))}
      </div>
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={String(row.id)}>
            <Link className="card block hover:bg-mist" href={`/o/${slug}/cases/${row.id}`}>
              <span className="font-bold">{String(row.code)}</span>
              <span className="badge ml-2">{STATUS_LABEL[String(row.status) as CaseStatus] ?? String(row.status)}</span>
              <span className="badge ml-2">{String(row.priority)}</span>
              <span className="mt-1 block">{String(row.summary)}</span>
              <span className="text-sm text-ink/70">{String(row.household)} · {String(row.household_code)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="card">No cases in this view.</p> : null}
    </div>
  );
}
