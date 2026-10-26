import { describe, expect, it } from "vitest";
import { fieldKeyDenied, validateFieldValues } from "../../lib/fields";
import { hashPassword, verifyPassword } from "../../lib/password";
import { nextStatuses } from "../../lib/status";
import { currentTotp, verifyTotp } from "../../lib/totp";
import { demoMfa } from "../../db/ids";

describe("case status", () => {
  it("lets an owner reopen a closed case and keeps that move away from a case worker", () => {
    expect(nextStatuses("closed", "owner")).toEqual(["active"]);
    expect(nextStatuses("closed", "case_worker")).toEqual([]);
    expect(nextStatuses("active", "case_worker")).toEqual(["waiting", "resolved", "closed"]);
  });
});

describe("program fields", () => {
  it("rejects sensitive keys, unknown keys, and missing required answers", () => {
    expect(fieldKeyDenied("ssn")).toBe(true);
    const result = validateFieldValues(
      [{ key: "children_count", label: "Children", field_type: "number", required: true, options: [] }],
      { ssn: "123", extra: "no", children_count: "" },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/not allowed/);
    expect(result.errors.join(" ")).toMatch(/Unknown field/);
    expect(result.errors.join(" ")).toMatch(/required/);
  });
});

describe("passwords", () => {
  it("verifies the stored scrypt hash and rejects a different password", async () => {
    const stored = await hashPassword("Harbor-lamp-42");
    expect(await verifyPassword("Harbor-lamp-42", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });
});

describe("totp", () => {
  it("accepts the current code for a demo secret", () => {
    const code = currentTotp(demoMfa.june);
    expect(verifyTotp(demoMfa.june, code)).toBe(true);
    expect(verifyTotp(demoMfa.june, "000000")).toBe(false);
  });
});
