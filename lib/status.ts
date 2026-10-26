export const CASE_STATUSES = ["new", "assessment", "active", "waiting", "resolved", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  new: ["assessment", "active", "closed"],
  assessment: ["active", "waiting", "closed"],
  active: ["waiting", "resolved", "closed"],
  waiting: ["active", "resolved", "closed"],
  resolved: ["closed", "active"],
  closed: ["active"],
};

export const STATUS_LABEL: Record<CaseStatus, string> = {
  new: "New",
  assessment: "Assessment",
  active: "Active",
  waiting: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export function nextStatuses(status: string, role: string) {
  const options = TRANSITIONS[status as CaseStatus] ?? [];
  if (status === "closed" && role !== "owner" && role !== "administrator") return [];
  return options;
}

export function canReopen(role: string) {
  return role === "owner" || role === "administrator";
}
