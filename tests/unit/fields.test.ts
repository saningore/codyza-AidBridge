import { describe, expect, it } from "vitest";
import { fieldKeyDenied, validateFieldValues, type FieldDefinition } from "../../lib/fields";

const fields: FieldDefinition[] = [
  { key: "children_count", label: "Children", field_type: "number", required: true, options: [] },
  { key: "visit_on", label: "Visit", field_type: "date", required: false, options: [] },
  { key: "consent", label: "Consent", field_type: "boolean", required: false, options: [] },
  { key: "size", label: "Size", field_type: "single_select", required: false, options: ["small", "large"] },
  { key: "note", label: "Note", field_type: "long_text", required: false, options: [] },
];

describe("program fields", () => {
  it("blocks sensitive keys in any spelling", () => {
    for (const key of ["ssn", "social_security", "SocialSecurity", "hiv_status", "passport_number", "biometric", "password", "diagnosis"]) {
      expect(fieldKeyDenied(key)).toBe(true);
    }
    expect(fieldKeyDenied("children_count")).toBe(false);
  });

  it("accepts a complete, trimmed set of answers", () => {
    const result = validateFieldValues(fields, {
      children_count: " 2 ",
      visit_on: "2026-10-23",
      consent: "yes",
      size: "small",
      note: "Backpack",
    });
    expect(result.ok).toBe(true);
    expect(result.values.children_count).toBe("2");
    expect(result.values.note).toBe("Backpack");
  });

  it("reports each kind of invalid answer", () => {
    const result = validateFieldValues(fields, {
      children_count: "many",
      visit_on: "Thursday",
      consent: "maybe",
      size: "medium",
      ssn: "123",
      extra: "no",
    });
    expect(result.ok).toBe(false);
    const text = result.errors.join(" ");
    expect(text).toMatch(/not allowed/);
    expect(text).toMatch(/Unknown field extra/);
    expect(text).toMatch(/Children must be a number/);
    expect(text).toMatch(/Visit must be a date/);
    expect(text).toMatch(/Consent must be yes or no/);
    expect(text).toMatch(/Size must use one of the listed choices/);
  });

  it("allows an optional field to stay blank", () => {
    const result = validateFieldValues(fields, { children_count: "1" });
    expect(result.ok).toBe(true);
    expect(result.values).toEqual({ children_count: "1" });
  });
});
