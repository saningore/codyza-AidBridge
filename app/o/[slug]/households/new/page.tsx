import { ActionForm } from "@/components/action-form";
import { PageIntro } from "@/components/shell";
import { createHousehold } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { listMembers } from "@/server/data";

const RELATIONSHIPS = ["self", "spouse", "partner", "child", "parent", "sibling", "grandparent", "grandchild", "other_relative", "unrelated"];

export default async function NewHouseholdPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const members = ctx.can("member.manage") || ctx.can("case.assign") ? (await listMembers(ctx)).members : [];
  return (
    <div>
      <PageIntro title="New household" lede="Collect the location and a way to reach the primary person. Leave the rest for a program that actually needs it." />
      <div className="card max-w-2xl">
        <ActionForm action={createHousehold} submitLabel="Save household">
          <input type="hidden" name="slug" value={slug} />
          <label className="field">Household label<input name="label" required placeholder="Henderson household" /></label>
          <label className="field">Primary person<input name="person" required /></label>
          <label className="field">Relationship
            <select name="relationship" defaultValue="self">{RELATIONSHIPS.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
          </label>
          <label className="field">Age band
            <select name="ageBand" defaultValue=""><option value="">Not recorded</option><option>child</option><option>youth</option><option>adult</option><option>senior</option></select>
          </label>
          <label className="field">Phone<input name="phone" /></label>
          <label className="field">Email<input name="email" type="email" /></label>
          <label className="field">General location<input name="location" required placeholder="Eastside, Springfield" /></label>
          <label className="field">Precision
            <select name="precision" defaultValue="neighborhood"><option>city</option><option>zip</option><option>neighborhood</option><option>address</option></select>
          </label>
          <label className="field">Street address, only if a delivery needs it<input name="street" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">Latitude, optional pin<input name="lat" inputMode="decimal" /></label>
            <label className="field">Longitude<input name="lng" inputMode="decimal" /></label>
          </div>
          {ctx.role !== "field_worker" && members.length > 0 ? (
            <label className="field">Assigned worker
              <select name="assignee" defaultValue=""><option value="">Unassigned</option>{members.map((member) => <option key={String(member.id)} value={String(member.id)}>{String(member.name)}</option>)}</select>
            </label>
          ) : null}
          <label className="flex min-h-11 items-start gap-2 font-bold">
            <input className="mt-1" type="checkbox" name="consent" required />
            The person was told what this organization will record and who inside it can see it.
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
