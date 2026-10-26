const DENY = /(ssn|social_security|socialsecurity|diagnosis|hiv|immigration|passport|biometric|password)/i;

export type FieldType = "short_text" | "long_text" | "number" | "date" | "single_select" | "boolean";

export type FieldDefinition = {
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  options: string[];
};

export function fieldKeyDenied(key: string) {
  return DENY.test(key);
}

export function validateFieldValues(definitions: FieldDefinition[], values: Record<string, string>) {
  const errors: string[] = [];
  const known = new Set(definitions.map((field) => field.key));
  for (const key of Object.keys(values)) {
    if (fieldKeyDenied(key)) errors.push("That field is not allowed on a program.");
    else if (!known.has(key)) errors.push(`Unknown field ${key}.`);
  }
  const clean: Record<string, string> = {};
  for (const field of definitions) {
    const raw = (values[field.key] ?? "").trim();
    if (field.required && raw === "") errors.push(`${field.label} is required.`);
    if (raw === "") continue;
    if (field.field_type === "number" && Number.isNaN(Number(raw))) errors.push(`${field.label} must be a number.`);
    if (field.field_type === "date" && Number.isNaN(Date.parse(raw))) errors.push(`${field.label} must be a date.`);
    if (field.field_type === "boolean" && raw !== "yes" && raw !== "no") errors.push(`${field.label} must be yes or no.`);
    if (field.field_type === "single_select" && field.options.length > 0 && !field.options.includes(raw)) {
      errors.push(`${field.label} must use one of the listed choices.`);
    }
    clean[field.key] = raw;
  }
  return { ok: errors.length === 0, errors, values: clean };
}
