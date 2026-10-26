"use client";

import { useEffect, useState } from "react";

export type MapPoint = { id: string; title: string; subtitle: string; lat: number; lng: number; kind: "household" | "site"; href: string };

export function MapView({ points }: { points: MapPoint[] }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (points.length === 0) return;
    let map: import("maplibre-gl").Map | undefined;
    let alive = true;
    (async () => {
      try {
        const lib = await import("maplibre-gl");
        if (!alive) return;
        lib.setWorkerUrl("/maplibre-gl-worker.mjs");
        map = new lib.Map({
          container: "aid-map",
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
          center: [points[0].lng, points[0].lat],
          zoom: 11,
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (!alive || !map) return;
          const bounds = new lib.LngLatBounds();
          for (const point of points) {
            bounds.extend([point.lng, point.lat]);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "map-pin";
            button.textContent = point.kind === "site" ? "Site" : "Home";
            button.setAttribute("aria-label", `${point.kind}: ${point.title}`);
            const content = document.createElement("div");
            const title = document.createElement("p");
            title.className = "map-popup-title";
            title.textContent = point.title;
            const kind = document.createElement("p");
            kind.className = "map-popup-kind";
            kind.textContent = point.subtitle;
            content.append(title, kind);
            if (point.href) {
              const link = document.createElement("a");
              link.href = point.href;
              link.textContent = "Open record";
              content.append(link);
            }
            new lib.Marker({ element: button })
              .setLngLat([point.lng, point.lat])
              .setPopup(new lib.Popup({ offset: 16 }).setDOMContent(content))
              .addTo(map);
          }
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
        });
        map.on("error", () => setFailed(true));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      map?.remove();
    };
  }, [points]);

  if (points.length === 0) {
    return <p className="card">No mapped locations yet. A list is still the record of what you have.</p>;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      {failed ? <p className="bg-sand px-3 py-2 text-sm font-bold">The map tiles are unavailable. The list below is still current.</p> : null}
      <div id="aid-map" className="h-96 w-full" role="region" aria-label="Map of households and service sites" />
    </div>
  );
}
