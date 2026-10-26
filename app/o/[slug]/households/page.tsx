import Link from "next/link";
import { PageIntro } from "@/components/shell";
import { requireOrg } from "@/server/context";
import { listHouseholds } from "@/server/data";

export default async function HouseholdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const ctx = await requireOrg(slug);
  const rows = await listHouseholds(ctx, q);
  return (
    <div>
      <PageIntro
        title="Households"
        lede="Names and contact details stay with the people who need them for the work."
        action={ctx.can("household.write") ? <Link className="btn" href={`/o/${slug}/households/new`}>Add household</Link> : null}
      />
      <form className="mb-4 flex gap-2" action={`/o/${slug}/households`}>
        <label className="field min-w-0 flex-1">Search
          <input name="q" defaultValue={q} placeholder="Code, name, or area" />
        </label>
        <button className="btn self-end">Search</button>
      </form>
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={String(row.id)}>
            <Link className="card block hover:bg-mist" href={`/o/${slug}/households/${row.id}`}>
              <span className="font-bold">{String(row.code)}</span>
              <span className="ml-2">{String(row.label)}</span>
              <span className="mt-1 block text-sm text-ink/70">{String(row.location_label)} · {String(row.location_precision)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="card">No households match this view.</p> : null}
    </div>
  );
}
