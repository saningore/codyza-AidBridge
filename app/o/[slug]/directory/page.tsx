import { PageIntro } from "@/components/shell";
import { ActionForm } from "@/components/action-form";
import { createSiteAction } from "@/server/record-actions";
import { requireOrg } from "@/server/context";
import { listDirectory } from "@/server/data";

export default async function DirectoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const sites = await listDirectory(ctx);
  return (
    <div>
      <PageIntro title="Service directory" lede="These sites belong to this organization. A missing phone or map point stays blank." />
      <ul className="grid gap-3">
        {sites.map((site) => (
          <li key={String(site.id)} className="card">
            <h2 className="font-serif text-2xl">{String(site.name)}</h2>
            <p>{String(site.category)} · {String(site.area_label || "Area not recorded")}</p>
            <p>{site.phone ? String(site.phone) : "Phone unavailable"}</p>
            <p>{String(site.hours_label || "Hours unavailable")}</p>
            <p className="text-sm text-ink/70">{String(site.eligibility || "Eligibility not recorded")}</p>
            <p className="text-sm">Last verified {site.last_verified_on ? String(site.last_verified_on) : "not yet"} · map {site.lat ? "placed" : String(site.geocode_status)}</p>
          </li>
        ))}
      </ul>
      {sites.length === 0 ? <p className="card">No services have been added.</p> : null}
      {ctx.can("directory.write") ? (
        <div className="card mt-4 max-w-2xl">
          <h2 className="font-serif text-2xl">Add a site</h2>
          <ActionForm action={createSiteAction} submitLabel="Save site">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Category<input name="category" defaultValue="Health" /></label>
            <label className="field">Eligibility<textarea name="eligibility" /></label>
            <label className="field">Hours<input name="hours" /></label>
            <label className="field">Phone<input name="phone" /></label>
            <label className="field">Area<input name="area" /></label>
            <label className="field">Street<input name="street" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">Latitude<input name="lat" /></label>
              <label className="field">Longitude<input name="lng" /></label>
            </div>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
