import { PageIntro } from "@/components/shell";
import { requireOrg } from "@/server/context";
import { reports } from "@/server/data";

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const data = await reports(ctx);
  return (
    <div className="grid gap-4">
      <PageIntro title="Reports" lede="Counts for this organization. A download is available to owners, administrators, and inventory managers." action={ctx.can("report.export") || ctx.can("inventory.export") ? <a className="btn" href={`/api/reports/${slug}`}>Download CSV</a> : null} />
      <section className="card">
        <h2 className="font-serif text-2xl">Cases</h2>
        <ul className="mt-3">{data.cases.map((row) => <li key={`${row.status}-${row.priority}`}>{String(row.status)} · {String(row.priority)} · {String(row.total)}</li>)}</ul>
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Services this month</h2>
        <ul className="mt-3">{data.services.map((row) => <li key={String(row.program_name)}>{String(row.program_name)} · {String(row.units)}</li>)}</ul>
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Inventory</h2>
        <ul className="mt-3">{data.inventory.map((row) => <li key={String(row.item_name)}>{String(row.item_name)} · {String(row.on_hand)}</li>)}</ul>
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Volunteer hours this month</h2>
        <ul className="mt-3">{data.hours.map((row) => <li key={String(row.volunteer_name)}>{String(row.volunteer_name)} · {String(row.hours)}</li>)}</ul>
      </section>
    </div>
  );
}
