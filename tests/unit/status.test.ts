import { describe, expect, it } from "vitest";
import { CASE_STATUSES, PRIORITIES, STATUS_LABEL, TRANSITIONS, canReopen, nextStatuses } from "../../lib/status";

describe("case status matrix", () => {
  it("names every status and priority the database allows", () => {
    expect(CASE_STATUSES).toEqual(["new", "assessment", "active", "waiting", "resolved", "closed"]);
    expect(PRIORITIES).toEqual(["low", "normal", "high", "urgent"]);
    for (const status of CASE_STATUSES) expect(STATUS_LABEL[status].length).toBeGreaterThan(0);
  });

  it("only offers moves that the matrix allows", () => {
    expect(nextStatuses("new", "case_worker")).toEqual(["assessment", "active", "closed"]);
    expect(nextStatuses("assessment", "field_worker")).toEqual(["active", "waiting", "closed"]);
    expect(nextStatuses("active", "viewer")).toEqual(["waiting", "resolved", "closed"]);
    expect(nextStatuses("waiting", "case_worker")).toEqual(["active", "resolved", "closed"]);
    expect(nextStatuses("resolved", "case_worker")).toEqual(["closed", "active"]);
    expect(nextStatuses("missing", "owner")).toEqual([]);
  });

  it("lets only an owner or administrator reopen a closed case", () => {
    expect(nextStatuses("closed", "owner")).toEqual(["active"]);
    expect(nextStatuses("closed", "administrator")).toEqual(["active"]);
    for (const role of ["case_worker", "field_worker", "viewer", "inventory_manager", "volunteer_coordinator"]) {
      expect(nextStatuses("closed", role)).toEqual([]);
      expect(canReopen(role)).toBe(false);
    }
    expect(canReopen("owner")).toBe(true);
    expect(canReopen("administrator")).toBe(true);
  });

  it("matches the transition table used by the database", () => {
    expect(TRANSITIONS.closed).toEqual(["active"]);
    expect(TRANSITIONS.new).not.toContain("resolved");
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...CASE_STATUSES].sort());
  });
});
