import Link from "next/link";
import { PageIntro } from "@/components/shell";
import { ActionForm } from "@/components/action-form";
import { createProgramAction } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { listPrograms } from "@/server/data";

export default async function ProgramsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const programs = await listPrograms(ctx);
  return (
    <div>
      <PageIntro title="Programs" lede="Programs, fields, and services are organization data. Adding one does not require a code change." />
      <ul className="grid gap-3">
        {programs.map((program) => (
          <li key={String(program.id)}>
            <Link className="card block hover:bg-mist" href={`/o/${slug}/programs/${program.id}`}>
              <span className="font-serif text-2xl">{String(program.name)}</span>
              {!program.active ? <span className="badge ml-2">Inactive</span> : null}
              <span className="mt-1 block text-sm">{String(program.description || "No description yet.")}</span>
              <span className="text-sm text-ink/70">{String(program.services)} services</span>
            </Link>
          </li>
        ))}
      </ul>
      {ctx.can("program.write") ? (
        <div className="card mt-4 max-w-2xl">
          <h2 className="font-serif text-2xl">New program</h2>
          <ActionForm action={createProgramAction} submitLabel="Create program">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Description<textarea name="description" /></label>
            <label className="field">Eligibility<textarea name="eligibility" /></label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
