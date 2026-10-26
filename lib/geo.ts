export async function geocodeAddress(address: string) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] };
    };
    const match = body.result?.addressMatches?.[0]?.coordinates;
    if (typeof match?.x !== "number" || typeof match?.y !== "number") return null;
    return { lng: match.x, lat: match.y };
  } catch {
    return null;
  }
}
