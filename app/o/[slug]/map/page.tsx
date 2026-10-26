import { MapView, type MapPoint } from "@/components/map-view";
import { PageIntro } from "@/components/shell";
import { requireOrg } from "@/server/context";
import { mapPoints } from "@/server/data";

export default async function MapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const data = await mapPoints(ctx);
  const points: MapPoint[] = [
    ...data.households.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      subtitle: String(row.subtitle),
      lat: Number(row.lat),
      lng: Number(row.lng),
      kind: "household" as const,
      href: `/o/${slug}/households/${row.id}`,
    })),
    ...data.sites.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      subtitle: String(row.subtitle),
      lat: Number(row.lat),
      lng: Number(row.lng),
      kind: "site" as const,
      href: `/o/${slug}/directory`,
    })),
  ].filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  return (
    <div>
      <PageIntro title="Map" lede="Pins follow what your role can see. Street-level pins stay off the map for people who do not need an address." />
      <MapView points={points} />
      <ul className="mt-4 grid gap-2">
        {points.map((point) => (
          <li key={point.id}><a className="font-bold text-pine underline" href={point.href}>{point.title}</a> · {point.subtitle}</li>
        ))}
      </ul>
    </div>
  );
}
