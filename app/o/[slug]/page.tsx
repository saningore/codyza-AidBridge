import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/shell";
import { formatDay, formatWhen, titleCaseStatus } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";
import { requireOrg } from "@/server/context";
import { dashboard } from "@/server/data";

export default async function OrgHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const data = await dashboard(ctx);
  if (!data) notFound();
  return (
    <div>
      <PageIntro title={`Hello, ${ctx.name.split(" ")[0]}`} lede="Your queue for this organization. Other organizations stay out of this list." />
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <h2 className="font-serif text-2xl">Cases</h2>
          {data.cases.length === 0 ? <p className="mt-2">No cases in your view yet.</p> : (
            <ul className="mt-3 grid gap-2">
              {data.cases.map((row) => (
                <li key={String(row.status)} className="flex justify-between">
                  <span>{STATUS_LABEL[row.status as keyof typeof STATUS_LABEL] ?? titleCaseStatus(String(row.status))}</span>
                  <span className="font-bold">{String(row.total)}</span>
                </li>
              ))}
            </ul>
          )}
          {ctx.can("case.read") ? <Link className="btn mt-4" href={`/o/${slug}/cases`}>Open cases</Link> : null}
        </section>
        <section className="card">
          <h2 className="font-serif text-2xl">Alerts</h2>
          <p className="mt-2 text-3xl font-bold">{data.unread}</p>
          <p className="text-sm">unread</p>
          <Link className="btn-secondary mt-4" href={`/o/${slug}/notifications`}>Review</Link>
        </section>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="font-serif text-2xl">Open tasks</h2>
          <ul className="mt-3 grid gap-2">
            {data.tasks.map((task) => (
              <li key={String(task.id)}><span className="font-bold">{String(task.code)}</span> · {String(task.title)}{task.due_on ? ` · ${formatDay(String(task.due_on), ctx.timezone)}` : ""}</li>
            ))}
          </ul>
          {data.tasks.length === 0 ? <p className="mt-2">No open tasks in your view.</p> : null}
        </section>
        <section className="card">
          <h2 className="font-serif text-2xl">Appointments</h2>
          <ul className="mt-3 grid gap-2">
            {data.appointments.map((item) => (
              <li key={String(item.id)}>{String(item.code)} · {String(item.place_label)} · {formatWhen(item.starts_at as Date, ctx.timezone)}</li>
            ))}
          </ul>
          {data.appointments.length === 0 ? <p className="mt-2">Nothing scheduled in your view.</p> : null}
        </section>
      </div>
      {data.stock.length > 0 ? (
        <section className="card mt-4">
          <h2 className="font-serif text-2xl">Low stock</h2>
          <ul className="mt-3">
            {data.stock.map((item) => (
              <li key={String(item.item_name)}>{String(item.item_name)} · {String(item.on_hand)} on hand, threshold {String(item.low_stock_threshold)}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
