export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "organization";
}

export function titleCaseStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatWhen(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDay(value: string | Date, timezone: string) {
  const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  const parsed = iso ? null : value instanceof Date ? value : new Date(value);
  const utcDate =
    parsed &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCHours() === 0 &&
    parsed.getUTCMinutes() === 0 &&
    parsed.getUTCSeconds() === 0
      ? parsed.toISOString().slice(0, 10)
      : "";
  const date = iso || utcDate ? new Date(`${iso || utcDate}T12:00:00Z`) : parsed ?? new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function dbMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/insufficient stock/i.test(message)) return "Not enough stock to record that assistance.";
  if (/invalid status transition/i.test(message)) return "That status change is not allowed.";
  if (/reason is required to reopen/i.test(message)) return "A reason is required to reopen a closed case.";
  if (/only an owner or administrator can reopen/i.test(message)) return "Only an owner or administrator can reopen a closed case.";
  if (/cannot reassign/i.test(message)) return "You cannot reassign this case.";
  if (/sensitive field denied/i.test(message)) return "That field collects more than this system allows.";
  if (/missing required field/i.test(message)) return "Fill in every required program field.";
  if (/unknown field/i.test(message)) return "That program field is not defined.";
  if (/duplicate key/i.test(message)) return "A record with that name already exists.";
  if (/invite is invalid/i.test(message)) return "This invite is invalid or expired.";
  console.error(JSON.stringify({ level: "error", message }));
  return "Could not save that change.";
}

export function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
