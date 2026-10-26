import { PageIntro } from "@/components/shell";
import { ActionForm } from "@/components/action-form";
import { formatWhen } from "@/lib/format";
import { createHours, createShift, createVolunteerAction } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { listVolunteers } from "@/server/data";

export default async function VolunteersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const data = await listVolunteers(ctx);
  return (
    <div className="grid gap-4">
      <PageIntro title="Volunteers" lede="Helpers are kept separate from people receiving assistance. Volunteer-visible tasks show a title, an area, and a household name." />
      <section className="card">
        <h2 className="font-serif text-2xl">People</h2>
        <ul className="mt-3">
          {data.volunteers.map((person) => (
            <li key={String(person.id)}>{String(person.name)}{person.skills ? ` · ${String(person.skills)}` : ""}{person.phone ? ` · ${String(person.phone)}` : ""}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Upcoming shifts</h2>
        <ul className="mt-3">
          {data.shifts.map((shift) => (
            <li key={String(shift.id)}>{String(shift.name)} · {String(shift.role_label)} · {formatWhen(shift.starts_at as string | Date, ctx.timezone)}</li>
          ))}
        </ul>
        {data.shifts.length === 0 ? <p className="mt-2">No upcoming shifts.</p> : null}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Volunteer-visible tasks</h2>
        <ul className="mt-3">
          {data.tasks.map((task) => (
            <li key={String(task.id)}>{String(task.title)} · {String(task.area_label || "Area not set")} · {String(task.household_label || "Household not set")} · {String(task.status)}</li>
          ))}
        </ul>
      </section>
      {ctx.can("volunteer.write") ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card">
            <h2 className="font-serif text-2xl">Add volunteer</h2>
            <ActionForm action={createVolunteerAction} submitLabel="Save">
              <input type="hidden" name="slug" value={slug} />
              <label className="field">Name<input name="name" required /></label>
              <label className="field">Phone<input name="phone" /></label>
              <label className="field">Email<input name="email" type="email" /></label>
              <label className="field">Skills<input name="skills" /></label>
            </ActionForm>
          </div>
          <div className="card">
            <h2 className="font-serif text-2xl">Shift</h2>
            <ActionForm action={createShift} submitLabel="Schedule">
              <input type="hidden" name="slug" value={slug} />
              <label className="field">Volunteer
                <select name="volunteerId">{data.volunteers.map((person) => <option key={String(person.id)} value={String(person.id)}>{String(person.name)}</option>)}</select>
              </label>
              <label className="field">Starts<input name="startsAt" type="datetime-local" required /></label>
              <label className="field">Ends<input name="endsAt" type="datetime-local" required /></label>
              <label className="field">Role<input name="roleLabel" defaultValue="Pantry" /></label>
            </ActionForm>
          </div>
          <div className="card">
            <h2 className="font-serif text-2xl">Hours</h2>
            <ActionForm action={createHours} submitLabel="Log hours">
              <input type="hidden" name="slug" value={slug} />
              <label className="field">Volunteer
                <select name="volunteerId">{data.volunteers.map((person) => <option key={String(person.id)} value={String(person.id)}>{String(person.name)}</option>)}</select>
              </label>
              <label className="field">Hours<input name="hours" type="number" min="0.25" max="24" step="0.25" required /></label>
              <label className="field">Date<input name="workedOn" type="date" required /></label>
              <label className="field">Note<input name="note" /></label>
            </ActionForm>
          </div>
        </div>
      ) : null}
    </div>
  );
}
