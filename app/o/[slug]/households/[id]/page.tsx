import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { signFile } from "@/lib/tokens";
import { formatDay } from "@/lib/format";
import { createEnrollment, createHouseholdNote, createPerson, uploadDocument } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { getHousehold } from "@/server/data";

const RELATIONSHIPS = ["self", "spouse", "partner", "child", "parent", "sibling", "grandparent", "grandchild", "other_relative", "unrelated"];

export default async function HouseholdPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireOrg(slug);
  const data = await getHousehold(ctx, id);
  if (!data) notFound();
  const household = data.household;
  const fields = data.fields as unknown as { program_id: string; key: string; label: string; field_type: string; required: boolean; options: string[] }[];
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-bold text-pine">{String(household.code)}</p>
        <h1 className="font-serif text-4xl">{String(household.label)}</h1>
        <p className="mt-1">{String(household.location_label)} · {String(household.location_precision)}</p>
        {household.phone ? <p>Phone {String(household.phone)}</p> : null}
        {household.email ? <p>Email {String(household.email)}</p> : null}
        {household.street_address ? <p>Delivery address {String(household.street_address)}</p> : null}
        {household.geocode_status === "unavailable" ? <p className="text-sm">Map coordinates are unavailable for this location.</p> : null}
      </div>
      <section className="card" id="people">
        <h2 className="font-serif text-2xl">People</h2>
        <ul className="mt-3 grid gap-2">
          {data.people.map((person) => (
            <li key={String(person.id)}>
              <span className="font-bold">{String(person.preferred_name)}</span> · {String(person.relationship).replaceAll("_", " ")}
              {person.age_band ? ` · ${String(person.age_band)}` : ""}
              {person.phone ? ` · ${String(person.phone)}` : ""}
            </li>
          ))}
        </ul>
        {ctx.can("household.write") ? (
          <div className="mt-4">
            <ActionForm action={createPerson} submitLabel="Add person">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="householdId" value={id} />
              <label className="field">Name<input name="name" required /></label>
              <label className="field">Relationship
                <select name="relationship" defaultValue="child">{RELATIONSHIPS.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
              </label>
              <label className="field">Age band
                <select name="ageBand" defaultValue=""><option value="">Not recorded</option><option>child</option><option>youth</option><option>adult</option><option>senior</option></select>
              </label>
              <label className="field">Phone<input name="phone" /></label>
            </ActionForm>
          </div>
        ) : null}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Cases</h2>
        <ul className="mt-3">
          {data.cases.map((item) => (
            <li key={String(item.id)}><Link className="font-bold text-pine underline" href={`/o/${slug}/cases/${item.id}`}>{String(item.code)}</Link> · {String(item.status)} · {String(item.summary)}</li>
          ))}
        </ul>
        {data.cases.length === 0 ? <p className="mt-2">No cases yet.</p> : null}
        {ctx.can("case.write") ? <Link className="btn mt-4" href={`/o/${slug}/cases/new?household=${id}`}>Open a case</Link> : null}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Programs</h2>
        <ul className="mt-3">
          {data.enrollments.map((item) => (
            <li key={String(item.id)}>{String(item.program_name)} · {String(item.status)} · since {formatDay(String(item.started_on), ctx.timezone)}</li>
          ))}
        </ul>
        {ctx.can("household.write") ? data.programs.map((program) => {
          const programFields = fields.filter((field) => field.program_id === program.id);
          return (
            <div key={String(program.id)} className="mt-4 border-t border-line pt-4">
              <ActionForm action={createEnrollment} submitLabel={`Enroll in ${String(program.name)}`}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="householdId" value={id} />
                <input type="hidden" name="programId" value={String(program.id)} />
                {programFields.map((field) => (
                  <label key={field.key} className="field">{field.label}{field.required ? " (required)" : ""}
                    {field.field_type === "single_select" ? (
                      <select name={`field_${field.key}`}>{["", ...(Array.isArray(field.options) ? field.options : [])].map((option) => <option key={option} value={option}>{option || "Choose"}</option>)}</select>
                    ) : field.field_type === "boolean" ? (
                      <select name={`field_${field.key}`}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select>
                    ) : field.field_type === "long_text" ? (
                      <textarea name={`field_${field.key}`} />
                    ) : (
                      <input name={`field_${field.key}`} type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"} />
                    )}
                  </label>
                ))}
              </ActionForm>
            </div>
          );
        }) : null}
      </section>
      {ctx.can("case.read_notes") ? (
        <section className="card" id="notes">
          <h2 className="font-serif text-2xl">Notes</h2>
          <ul className="mt-3 grid gap-3">
            {data.notes.map((note) => (
              <li key={String(note.id)}><p>{String(note.body)}</p><p className="text-sm text-ink/60">{String(note.author)}</p></li>
            ))}
          </ul>
          {ctx.can("household.write") ? (
            <div className="mt-4">
              <ActionForm action={createHouseholdNote} submitLabel="Add note">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="householdId" value={id} />
                <label className="field">Note<textarea name="body" required /></label>
              </ActionForm>
            </div>
          ) : null}
        </section>
      ) : null}
      {ctx.can("document.read") ? (
        <section className="card" id="documents">
          <h2 className="font-serif text-2xl">Documents</h2>
          <ul className="mt-3">
            {data.documents.map((doc) => {
              const token = signFile(String(doc.id), Date.now() + 5 * 60 * 1000);
              return <li key={String(doc.id)}><a className="font-bold text-pine underline" href={`/api/files/${doc.id}?token=${token}`}>{String(doc.filename)}</a></li>;
            })}
          </ul>
          {ctx.can("document.write") ? (
            <div className="mt-4">
              <ActionForm action={uploadDocument} submitLabel="Upload">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="householdId" value={id} />
                <label className="field">PDF or image<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
              </ActionForm>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
