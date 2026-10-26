import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "../../lib/geo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geocodeAddress", () => {
  it("returns longitude and latitude from the first census match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          result: { addressMatches: [{ coordinates: { x: -89.65, y: 39.8 } }] },
        }),
      ),
    );
    await expect(geocodeAddress("100 Health Ave, Springfield, IL")).resolves.toEqual({ lng: -89.65, lat: 39.8 });
  });

  it("returns null when the census response has no point", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: { addressMatches: [] } })));
    await expect(geocodeAddress("nowhere")).resolves.toBeNull();
  });

  it("returns null when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(geocodeAddress("100 Health Ave")).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(geocodeAddress("100 Health Ave")).resolves.toBeNull();
  });
});
