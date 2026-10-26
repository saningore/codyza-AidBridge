import { ActionForm } from "@/components/action-form";
import { PageIntro } from "@/components/shell";
import { PRIORITIES } from "@/lib/status";
import { openCase } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { caseFormOptions } from "@/server/data";

export default async function NewCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ household?: string }>;
}) {
  const { slug } = await params;
  const { household = "" } = await searchParams;
  const ctx = await requireOrg(slug);
  const options = await caseFormOptions(ctx);
  return (
    <div>
      <PageIntro title="Open a case" lede="The case starts as New. Every later status change is kept." />
      <div className="card max-w-2xl">
        <ActionForm action={openCase} submitLabel="Open case">
          <input type="hidden" name="slug" value={slug} />
          <label className="field">Household
            <select name="householdId" defaultValue={household} required>
              <option value="">Choose</option>
              {options.households.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.code)} · {String(item.label)}</option>)}
            </select>
          </label>
          <label className="field">Case type
            <select name="caseTypeId" required>
              {options.types.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}
            </select>
          </label>
          <label className="field">Short title<input name="summary" required maxLength={180} placeholder="Food assistance" /></label>
          <label className="field">Priority
            <select name="priority" defaultValue="normal">{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          {ctx.can("case.assign") ? (
            <label className="field">Assignee
              <select name="assigneeId" defaultValue={ctx.userId}>
                <option value="">Unassigned</option>
                {options.workers.map((worker) => <option key={String(worker.id)} value={String(worker.id)}>{String(worker.name)}</option>)}
              </select>
            </label>
          ) : null}
        </ActionForm>
      </div>
    </div>
  );
}
