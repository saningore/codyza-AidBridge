import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { signFile } from "@/lib/tokens";
import { formatDay, formatWhen } from "@/lib/format";
import { nextStatuses, STATUS_LABEL, type CaseStatus } from "@/lib/status";
import {
  changeStatus,
  createAppointment,
  createCaseNote,
  createReferralAction,
  createTask,
  giveAssistance,
  reassignCase,
  updateAppointment,
  updateReferral,
  updateTask,
  uploadDocument,
} from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { getCase } from "@/server/data";

export default async function CasePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireOrg(slug);
  const data = await getCase(ctx, id);
  if (!data) notFound();
  const record = data.record;
  const status = String(record.status);
  const moves = nextStatuses(status, ctx.role);
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-bold text-pine">{String(record.code)}</p>
        <h1 className="font-serif text-4xl">{String(record.summary)}</h1>
        <p className="mt-2">
          <span className="badge">{STATUS_LABEL[status as CaseStatus] ?? status}</span>
          <span className="badge ml-2">{String(record.priority)}</span>
          <span className="ml-2">{String(record.type_name)}</span>
        </p>
        <p className="mt-2">
          Household <Link className="font-bold text-pine underline" href={`/o/${slug}/households/${record.household_id}`}>{String(record.household_label)}</Link>
          {" "}· opened {formatDay(String(record.opened_on), ctx.timezone)}
          {record.assignee_name ? ` · ${String(record.assignee_name)}` : ""}
        </p>
      </div>

      {ctx.can("case.write") && moves.length > 0 ? (
        <section className="card">
          <h2 className="font-serif text-2xl">Status</h2>
          <div className="mt-3 grid gap-4">
            {moves.map((next) => (
              <ActionForm key={next} action={changeStatus} submitLabel={`Move to ${STATUS_LABEL[next]}`}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="caseId" value={id} />
                <input type="hidden" name="status" value={next} />
                {status === "closed" ? <label className="field">Reason<textarea name="reason" required /></label> : <input type="hidden" name="reason" value="" />}
              </ActionForm>
            ))}
          </div>
        </section>
      ) : null}

      {ctx.can("case.assign") ? (
        <section className="card">
          <h2 className="font-serif text-2xl">Assignment</h2>
          <ActionForm action={reassignCase} submitLabel="Assign">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="caseId" value={id} />
            <label className="field">Worker
              <select name="assigneeId" defaultValue={String(record.assignee_id ?? "")}>
                {data.workers.map((worker) => <option key={String(worker.id)} value={String(worker.id)}>{String(worker.name)}</option>)}
              </select>
            </label>
          </ActionForm>
        </section>
      ) : null}

      {ctx.can("case.read_notes") ? (
        <section className="card" id="notes">
          <h2 className="font-serif text-2xl">Notes</h2>
          <ul className="mt-3 grid gap-3">
            {data.notes.map((note) => (
              <li key={String(note.id)}><p>{String(note.body)}</p><p className="text-sm text-ink/60">{String(note.author)} · {formatWhen(note.created_at as string | Date, ctx.timezone)}</p></li>
            ))}
          </ul>
          {data.notes.length === 0 ? <p className="mt-2">No notes yet.</p> : null}
          {ctx.can("case.write") ? (
            <div className="mt-4">
              <ActionForm action={createCaseNote} submitLabel="Add note">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="caseId" value={id} />
                <label className="field">Note<textarea name="body" required /></label>
              </ActionForm>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card" id="tasks">
        <h2 className="font-serif text-2xl">Tasks</h2>
        <ul className="mt-3 grid gap-2">
          {data.tasks.map((task) => (
            <li key={String(task.id)} className="flex flex-wrap items-center justify-between gap-2">
              <span>{String(task.title)} · {String(task.status)}{task.volunteer_visible ? " · volunteer visible" : ""}</span>
              {ctx.can("case.write") && task.status === "open" ? (
                <ActionForm action={updateTask} submitLabel="Mark done">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="caseId" value={id} />
                  <input type="hidden" name="taskId" value={String(task.id)} />
                  <input type="hidden" name="status" value="done" />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
        {ctx.can("case.write") ? (
          <div className="mt-4">
            <ActionForm action={createTask} submitLabel="Add task">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="caseId" value={id} />
              <input type="hidden" name="householdLabel" value={String(record.household_label)} />
              <label className="field">Title<input name="title" required /></label>
              <label className="field">Due<input name="dueOn" type="date" /></label>
              <label className="field">Area label<input name="area" placeholder="Eastside" /></label>
              <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" name="volunteerVisible" /> Volunteer coordinator can see this title, area, and household name</label>
            </ActionForm>
          </div>
        ) : null}
      </section>

      <section className="card" id="appointments">
        <h2 className="font-serif text-2xl">Appointments</h2>
        <ul className="mt-3 grid gap-2">
          {data.appointments.map((item) => (
            <li key={String(item.id)} className="flex flex-wrap justify-between gap-2">
              <span>{formatWhen(item.starts_at as string | Date, ctx.timezone)} · {String(item.place_label)} · {String(item.status)}</span>
              {ctx.can("case.write") ? (
                <ActionForm action={updateAppointment} submitLabel="Complete">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="caseId" value={id} />
                  <input type="hidden" name="appointmentId" value={String(item.id)} />
                  <input type="hidden" name="status" value="completed" />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
        {ctx.can("case.write") ? (
          <div className="mt-4">
            <ActionForm action={createAppointment} submitLabel="Schedule">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="caseId" value={id} />
              <label className="field">When<input name="startsAt" type="datetime-local" required /></label>
              <label className="field">Place label<input name="place" required placeholder="Main pantry" /></label>
            </ActionForm>
          </div>
        ) : null}
      </section>

      {ctx.can("assistance.write") || data.assistance.length > 0 ? (
        <section className="card" id="assistance">
          <h2 className="font-serif text-2xl">Assistance</h2>
          <ul className="mt-3">
            {data.assistance.map((line) => (
              <li key={String(line.id)}>{formatDay(String(line.served_on), ctx.timezone)} · {String(line.quantity)} {String(line.unit)} · {String(line.service_name)}</li>
            ))}
          </ul>
          {ctx.can("assistance.write") ? (
            <div className="mt-4">
              <ActionForm action={giveAssistance} submitLabel="Record assistance">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="caseId" value={id} />
                <label className="field">Service
                  <select name="serviceId" required>
                    {data.services.map((service) => (
                      <option key={String(service.id)} value={String(service.id)}>
                        {String(service.program_name)} · {String(service.name)}{service.tracks_inventory ? " (stocked)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">Quantity<input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required /></label>
                {data.locations.length > 0 ? (
                  <label className="field">Storage location for stocked services
                    <select name="locationId">
                      {data.locations.map((location) => <option key={String(location.id)} value={String(location.id)}>{String(location.name)}</option>)}
                    </select>
                  </label>
                ) : null}
              </ActionForm>
            </div>
          ) : null}
        </section>
      ) : null}

      {ctx.can("case.read_notes") ? (
        <section className="card" id="referrals">
          <h2 className="font-serif text-2xl">Referrals</h2>
          <ul className="mt-3 grid gap-2">
            {data.referrals.map((item) => (
              <li key={String(item.id)}>
                {String(item.status)} · {String(item.program_name || item.site_name)} · {String(item.packet_need)}
                {ctx.can("referral.write") ? (
                  <ActionForm action={updateReferral} submitLabel="Mark completed">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="caseId" value={id} />
                    <input type="hidden" name="referralId" value={String(item.id)} />
                    <input type="hidden" name="status" value="completed" />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
          {ctx.can("referral.write") ? (
            <div className="mt-4">
              <ActionForm action={createReferralAction} submitLabel="Send referral">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="caseId" value={id} />
                <label className="field">Kind
                  <select name="kind" defaultValue="directory"><option value="directory">Directory site</option><option value="internal_program">Another program here</option></select>
                </label>
                <label className="field">Program
                  <select name="programId"><option value="">None</option>{data.programs.map((program) => <option key={String(program.id)} value={String(program.id)}>{String(program.name)}</option>)}</select>
                </label>
                <label className="field">Directory site
                  <select name="siteId"><option value="">None</option>{data.sites.map((site) => <option key={String(site.id)} value={String(site.id)}>{String(site.name)}</option>)}</select>
                </label>
                <label className="field">Need to share<textarea name="need" required /></label>
                <label className="field">Contact the person agreed to share<input name="contact" /></label>
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
                <input type="hidden" name="caseId" value={id} />
                <label className="field">PDF or image<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
              </ActionForm>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card" id="timeline">
        <h2 className="font-serif text-2xl">Timeline</h2>
        <ul className="mt-3 grid gap-2">
          {data.timeline.map((event, index) => (
            <li key={`${String(event.created_at)}-${index}`}>
              {formatWhen(event.created_at as string | Date, ctx.timezone)} · {String(event.actor ?? "System")} · {String(event.action)}
              {event.before_status ? ` · ${String(event.before_status)} to ${String(event.after_status)}` : ""}
            </li>
          ))}
        </ul>
        {data.timeline.length === 0 ? <p className="mt-2">No recorded changes in your view yet.</p> : null}
      </section>
    </div>
  );
}
