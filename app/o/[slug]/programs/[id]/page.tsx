import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { createField, createService, toggleProgram } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { getProgram } from "@/server/data";

export default async function ProgramPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireOrg(slug);
  const data = await getProgram(ctx, id);
  if (!data) notFound();
  const program = data.program;
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-serif text-4xl">{String(program.name)}</h1>
        <p className="mt-2">{String(program.description)}</p>
        <p className="mt-1 text-ink/75">{String(program.eligibility || "Eligibility has not been written yet.")}</p>
        {ctx.can("program.write") ? (
          <div className="mt-3 max-w-xs">
            <ActionForm action={toggleProgram} submitLabel={program.active ? "Mark inactive" : "Mark active"}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="programId" value={id} />
              <input type="hidden" name="active" value={program.active ? "false" : "true"} />
            </ActionForm>
          </div>
        ) : null}
      </div>
      <section className="card">
        <h2 className="font-serif text-2xl">Fields</h2>
        <ul className="mt-3">
          {data.fields.map((field) => (
            <li key={String(field.id)}>{String(field.label)} · {String(field.key)} · {String(field.field_type)}{field.required ? " · required" : ""}</li>
          ))}
        </ul>
        {data.fields.length === 0 ? <p className="mt-2">No extra fields. Households can still enroll.</p> : null}
        {ctx.can("program.write") ? (
          <div className="mt-4">
            <ActionForm action={createField} submitLabel="Add field">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="programId" value={id} />
              <label className="field">Label<input name="label" required /></label>
              <label className="field">Key<input name="key" required placeholder="children_count" /></label>
              <label className="field">Type
                <select name="fieldType" defaultValue="short_text">
                  <option value="short_text">Short text</option>
                  <option value="long_text">Long text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="single_select">Single choice</option>
                  <option value="boolean">Yes or no</option>
                </select>
              </label>
              <label className="field">Choices, comma separated<input name="options" /></label>
              <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" name="required" /> Required to enroll</label>
            </ActionForm>
          </div>
        ) : null}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Services</h2>
        <ul className="mt-3">
          {data.services.map((service) => (
            <li key={String(service.id)}>{String(service.name)} · {String(service.unit)}{service.tracks_inventory ? ` · stock ${String(service.item_name ?? "")}` : ""}</li>
          ))}
        </ul>
        {ctx.can("program.write") ? (
          <div className="mt-4">
            <ActionForm action={createService} submitLabel="Add service">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="programId" value={id} />
              <label className="field">Name<input name="name" required /></label>
              <label className="field">Unit<input name="unit" defaultValue="each" /></label>
              <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" name="tracks" /> This service takes inventory</label>
              <label className="field">Inventory item
                <select name="itemId"><option value="">None</option>{data.items.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select>
              </label>
            </ActionForm>
          </div>
        ) : null}
      </section>
    </div>
  );
}
