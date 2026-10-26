import Link from "next/link";
import { PageIntro } from "@/components/shell";
import { requireOrg } from "@/server/context";
import { searchAll } from "@/server/data";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const ctx = await requireOrg(slug);
  const results = q.trim().length >= 2 ? await searchAll(ctx, q) : null;
  return (
    <div>
      <PageIntro title="Search" lede="Results follow your role. Two characters are enough to start." />
      <form className="mb-4 flex gap-2" action={`/o/${slug}/search`}>
        <label className="field min-w-0 flex-1">Search
          <input name="q" defaultValue={q} />
        </label>
        <button className="btn self-end">Search</button>
      </form>
      {results ? (
        <div className="grid gap-4">
          <Result title="Households" rows={results.households.map((row) => ({ href: `/o/${slug}/households/${row.id}`, label: `${row.code} · ${row.label}` }))} />
          <Result title="Cases" rows={results.cases.map((row) => ({ href: `/o/${slug}/cases/${row.id}`, label: `${row.code} · ${row.summary}` }))} />
          <Result title="Volunteers" rows={results.volunteers.map((row) => ({ href: `/o/${slug}/volunteers`, label: String(row.name) }))} />
          <Result title="Inventory" rows={results.items.map((row) => ({ href: `/o/${slug}/inventory`, label: String(row.name) }))} />
          <Result title="Directory" rows={results.sites.map((row) => ({ href: `/o/${slug}/directory`, label: String(row.name) }))} />
        </div>
      ) : <p>Enter at least two characters.</p>}
    </div>
  );
}

function Result({ title, rows }: { title: string; rows: { href: string; label: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="font-serif text-2xl">{title}</h2>
      <ul className="mt-2">{rows.map((row) => <li key={row.href + row.label}><Link className="font-bold text-pine underline" href={row.href}>{row.label}</Link></li>)}</ul>
    </section>
  );
}
