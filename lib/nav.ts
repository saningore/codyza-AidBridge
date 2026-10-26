export const NAV = [
  { href: "", label: "Home", permission: null },
  { href: "/households", label: "Households", permission: "household.read" },
  { href: "/cases", label: "Cases", permission: "case.read" },
  { href: "/programs", label: "Programs", permission: "program.read" },
  { href: "/inventory", label: "Inventory", permission: "inventory.read" },
  { href: "/volunteers", label: "Volunteers", permission: "volunteer.read" },
  { href: "/directory", label: "Directory", permission: "directory.read" },
  { href: "/map", label: "Map", permission: "directory.read" },
  { href: "/reports", label: "Reports", permission: "report.read" },
  { href: "/search", label: "Search", permission: null },
  { href: "/notifications", label: "Alerts", permission: "notification.read" },
  { href: "/settings", label: "Settings", permission: "org.manage" },
  { href: "/audit", label: "Audit", permission: "audit.read" },
] as const;

export type Permission = string;

export function visibleNav(can: (permission: string) => boolean) {
  return NAV.filter((item) => {
    if (item.href === "/map") return can("household.read") || can("directory.read");
    if (item.href === "/settings") return can("org.manage") || can("member.manage");
    return item.permission == null || can(item.permission);
  });
}
