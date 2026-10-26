import { describe, expect, it } from "vitest";
import { visibleNav } from "../../lib/nav";

function allow(permissions: string[]) {
  return (permission: string) => permissions.includes(permission);
}

describe("visibleNav", () => {
  it("shows an owner every section", () => {
    const labels = visibleNav(() => true).map((item) => item.label);
    expect(labels).toEqual([
      "Home", "Households", "Cases", "Programs", "Inventory", "Volunteers",
      "Directory", "Map", "Reports", "Search", "Alerts", "Settings", "Audit",
    ]);
  });

  it("hides contact-bearing sections from a viewer and still shows the map", () => {
    const labels = visibleNav(allow([
      "household.read", "case.read", "program.read", "directory.read", "report.read", "notification.read",
    ])).map((item) => item.label);
    expect(labels).toEqual(["Home", "Households", "Cases", "Programs", "Directory", "Map", "Reports", "Search", "Alerts"]);
  });

  it("shows a field worker households and the map, and keeps settings away", () => {
    const labels = visibleNav(allow([
      "household.read", "case.read", "program.read", "inventory.read", "directory.read", "notification.read",
    ])).map((item) => item.label);
    expect(labels).toContain("Households");
    expect(labels).toContain("Map");
    expect(labels).not.toContain("Settings");
    expect(labels).not.toContain("Volunteers");
    expect(labels).not.toContain("Reports");
  });

  it("shows a coordinator volunteer work and hides household records", () => {
    const labels = visibleNav(allow([
      "program.read", "volunteer.read", "volunteer.write", "directory.read", "report.read", "notification.read",
    ])).map((item) => item.label);
    expect(labels).toContain("Volunteers");
    expect(labels).toContain("Map");
    expect(labels).not.toContain("Households");
    expect(labels).not.toContain("Cases");
  });

  it("shows an inventory manager stock and reports, and hides the map", () => {
    const labels = visibleNav(allow([
      "program.read", "inventory.read", "inventory.write", "inventory.export", "report.read", "notification.read",
    ])).map((item) => item.label);
    expect(labels).toEqual(["Home", "Programs", "Inventory", "Reports", "Search", "Alerts"]);
  });
});
