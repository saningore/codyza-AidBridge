import { PageIntro } from "@/components/shell";
import { ActionForm } from "@/components/action-form";
import { formatWhen } from "@/lib/format";
import { createItemAction, stockAction } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { listInventory } from "@/server/data";

export default async function InventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const data = await listInventory(ctx);
  return (
    <div>
      <PageIntro title="Inventory" lede="Issuing a stocked service reduces the balance in the same save. The balance cannot go below zero." />
      <ul className="grid gap-3">
        {data.items.map((item) => (
          <li key={String(item.item_name)} className="card flex justify-between">
            <span className="font-bold">{String(item.item_name)}</span>
            <span>{String(item.on_hand)} on hand{item.low_stock_threshold != null ? ` · alert at ${String(item.low_stock_threshold)}` : ""}</span>
          </li>
        ))}
      </ul>
      {ctx.can("inventory.write") ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="font-serif text-2xl">Item</h2>
            <ActionForm action={createItemAction} submitLabel="Add item">
              <input type="hidden" name="slug" value={slug} />
              <label className="field">Name<input name="name" required /></label>
              <label className="field">Unit<input name="unit" defaultValue="box" /></label>
              <label className="field">Low-stock threshold<input name="threshold" type="number" step="0.01" /></label>
            </ActionForm>
          </div>
          <div className="card">
            <h2 className="font-serif text-2xl">Movement</h2>
            <ActionForm action={stockAction} submitLabel="Record movement">
              <input type="hidden" name="slug" value={slug} />
              <label className="field">Item
                <select name="itemId">{data.catalog.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select>
              </label>
              <label className="field">Location
                <select name="locationId">{data.locations.map((location) => <option key={String(location.id)} value={String(location.id)}>{String(location.name)}</option>)}</select>
              </label>
              <label className="field">Reason
                <select name="reason"><option value="receive">Receive</option><option value="adjust">Adjust</option><option value="loss">Loss</option></select>
              </label>
              <label className="field">Quantity<input name="quantity" type="number" step="0.01" required /></label>
              <label className="field">Note<input name="note" /></label>
            </ActionForm>
          </div>
        </div>
      ) : null}
      {data.movements.length > 0 ? (
        <section className="card mt-4">
          <h2 className="font-serif text-2xl">Recent movements</h2>
          <ul className="mt-3">
            {data.movements.map((row) => (
              <li key={String(row.id)}>{formatWhen(row.created_at as string | Date, ctx.timezone)} · {String(row.reason)} · {String(row.quantity)} · {String(row.item_name)}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
