import { notFound } from "next/navigation";
import { PageIntro } from "@/components/shell";
import { ActionForm } from "@/components/action-form";
import { formatWhen, titleCaseStatus } from "@/lib/format";
import { mailConfigured } from "@/lib/mail";
import { purgeAction, removeMemberAction, saveOrganization, transferAction } from "@/server/record-actions";
import { sendInvite } from "@/server/auth-actions";
import { requireOrg } from "@/server/context";
import { listMembers } from "@/server/data";

const ROLES = ["administrator", "case_worker", "field_worker", "volunteer_coordinator", "inventory_manager", "viewer", "owner"];

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  if (!ctx.can("org.manage") && !ctx.can("member.manage")) notFound();
  const data = await listMembers(ctx);
  return (
    <div className="grid gap-4">
      <PageIntro title="Settings" lede={mailConfigured() ? "Invites can be emailed." : "Email is not configured. Invite links are shown here so you can copy them."} />
      {ctx.can("org.manage") ? (
        <section className="card max-w-2xl">
          <h2 className="font-serif text-2xl">Organization</h2>
          <ActionForm action={saveOrganization} submitLabel="Save settings">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Name<input name="name" defaultValue={ctx.orgName} required /></label>
            <label className="field">Timezone<input name="timezone" defaultValue={ctx.timezone} required /></label>
            <label className="field">Household prefix<input name="householdPrefix" defaultValue={ctx.householdPrefix} required /></label>
            <label className="field">Case prefix<input name="casePrefix" defaultValue={ctx.casePrefix} required /></label>
          </ActionForm>
        </section>
      ) : null}
      <section className="card">
        <h2 className="font-serif text-2xl">Members</h2>
        <ul className="mt-3 grid gap-2">
          {data.members.map((member) => (
            <li key={String(member.id)} className="flex flex-wrap items-center justify-between gap-2">
              <span>{String(member.name)} · {String(member.email)} · {titleCaseStatus(String(member.role))}</span>
              {ctx.can("member.manage") && member.id !== ctx.userId && member.role !== "owner" ? (
                <ActionForm action={removeMemberAction} submitLabel="Remove">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="userId" value={String(member.id)} />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
        {ctx.can("member.invite") ? (
          <div className="mt-4 max-w-xl">
            <ActionForm action={sendInvite} submitLabel="Create invite">
              <input type="hidden" name="slug" value={slug} />
              <label className="field">Email<input name="email" type="email" required /></label>
              <label className="field">Role
                <select name="role" defaultValue="case_worker">
                  {ROLES.filter((role) => role !== "owner" || ctx.role === "owner").map((role) => <option key={role} value={role}>{titleCaseStatus(role)}</option>)}
                </select>
              </label>
            </ActionForm>
          </div>
        ) : null}
        {data.invites.length > 0 ? (
          <ul className="mt-4 text-sm">
            {data.invites.map((invite) => <li key={String(invite.id)}>{String(invite.email)} · {String(invite.role)} · expires {formatWhen(invite.expires_at as string | Date, ctx.timezone)}</li>)}
          </ul>
        ) : null}
      </section>
      {ctx.role === "owner" ? (
        <section className="card max-w-xl">
          <h2 className="font-serif text-2xl">Ownership</h2>
          <ActionForm action={transferAction} submitLabel="Transfer ownership">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">New owner
              <select name="userId">{data.members.filter((member) => member.id !== ctx.userId).map((member) => <option key={String(member.id)} value={String(member.id)}>{String(member.name)}</option>)}</select>
            </label>
          </ActionForm>
          <div className="mt-4">
            <p>{ctx.purgeAfter ? `Deletion is scheduled for ${formatWhen(ctx.purgeAfter, ctx.timezone)}.` : "Deletion waits 7 days and can be cancelled."}</p>
            <ActionForm action={purgeAction} submitLabel={ctx.purgeAfter ? "Cancel deletion" : "Schedule deletion"}>
              <input type="hidden" name="slug" value={slug} />
              {ctx.purgeAfter ? <input type="hidden" name="cancel" value="1" /> : null}
            </ActionForm>
          </div>
        </section>
      ) : null}
    </div>
  );
}
