import { afterEach, describe, expect, it, vi } from "vitest";
import { dbMessage, formatDay, formatWhen, likePattern, slugify, titleCaseStatus } from "../../lib/format";

describe("slugify", () => {
  it("turns a name into a short url piece", () => {
    expect(slugify("Community Food Bank!")).toBe("community-food-bank");
    expect(slugify("  Rural — Assistance  ")).toBe("rural-assistance");
  });

  it("falls back when the name has no letters or digits", () => {
    expect(slugify("!!!")).toBe("organization");
    expect(slugify("   ")).toBe("organization");
  });

  it("stops at 48 characters", () => {
    expect(slugify("a".repeat(80))).toHaveLength(48);
  });
});

describe("titleCaseStatus", () => {
  it("turns role keys into words", () => {
    expect(titleCaseStatus("field_worker")).toBe("Field Worker");
    expect(titleCaseStatus("volunteer_coordinator")).toBe("Volunteer Coordinator");
  });
});

describe("dates", () => {
  it("keeps a date-only value on that calendar day in Chicago", () => {
    expect(formatDay("2026-10-23", "America/Chicago")).toBe("Oct 23, 2026");
    expect(formatDay(new Date("2026-10-23T00:00:00.000Z"), "America/Chicago")).toBe("Oct 23, 2026");
    expect(formatDay(String(new Date("2026-10-23T00:00:00.000Z")), "America/Chicago")).toBe("Oct 23, 2026");
  });

  it("formats a real timestamp in the organization timezone", () => {
    expect(formatWhen("2026-10-24T19:07:00.000Z", "America/Chicago")).toBe("Oct 24, 2026, 2:07 PM");
    expect(formatDay(new Date("2026-10-24T03:30:00.000Z"), "America/Chicago")).toBe("Oct 23, 2026");
  });
});

describe("dbMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["insufficient stock for rice", "Not enough stock to record that assistance."],
    ["invalid status transition", "That status change is not allowed."],
    ["a reason is required to reopen a closed case", "A reason is required to reopen a closed case."],
    ["only an owner or administrator can reopen a closed case", "Only an owner or administrator can reopen a closed case."],
    ["you cannot reassign this case", "You cannot reassign this case."],
    ["sensitive field denied", "That field collects more than this system allows."],
    ["missing required field", "Fill in every required program field."],
    ["unknown field", "That program field is not defined."],
    ["duplicate key value", "A record with that name already exists."],
    ["invite is invalid", "This invite is invalid or expired."],
  ])("maps %s", (message, expected) => {
    expect(dbMessage(new Error(message))).toBe(expected);
  });

  it("hides an unexpected database error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(dbMessage(new Error("connection reset"))).toBe("Could not save that change.");
    expect(spy).toHaveBeenCalled();
    expect(dbMessage("nope")).toBe("Could not save that change.");
  });
});

describe("likePattern", () => {
  it("escapes wildcard characters", () => {
    expect(likePattern("100%_\\")).toBe("%100\\%\\_\\\\%");
    expect(likePattern("H-1042")).toBe("%H-1042%");
  });
});
