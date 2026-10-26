"use server";

import { redirect } from "next/navigation";
import { geocodeAddress } from "@/lib/geo";
import { fieldKeyDenied, validateFieldValues, type FieldDefinition } from "@/lib/fields";
import { dbMessage } from "@/lib/format";
import { requireOrg } from "@/server/context";
import type { FormState } from "@/server/forms";
import * as data from "@/server/data";
import { sql } from "@/server/db";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(value: string) {
  return value.length ? value : null;
}

async function orgFrom(formData: FormData) {
  return requireOrg(text(formData, "slug"));
}

export async function createHousehold(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  if (!ctx.can("household.write")) return { error: "You cannot add households." };
  if (formData.get("consent") !== "on") {
    return { error: "Record that the person was told what this organization keeps and who can see it." };
  }
  const label = text(formData, "label");
  const person = text(formData, "person");
  const locationLabel = text(formData, "location");
  const precision = text(formData, "precision") || "neighborhood";
  const street = optional(text(formData, "street"));
  if (!label || !person || !locationLabel) return { error: "Add a household name, a primary person, and a general location." };
  let lat = Number(text(formData, "lat"));
  let lng = Number(text(formData, "lng"));
  let geocodeStatus = "untried";
  const manual = Number.isFinite(lat) && Number.isFinite(lng) && text(formData, "lat") !== "";
  if (manual) geocodeStatus = "manual";
  else {
    const found = await geocodeAddress([street, locationLabel].filter(Boolean).join(", "));
    if (found) {
      lat = found.lat;
      lng = found.lng;
      geocodeStatus = "geocoded";
    } else {
      lat = Number.NaN;
      lng = Number.NaN;
      geocodeStatus = "unavailable";
    }
  }
  try {
    const created = await data.saveHousehold(ctx, {
      label,
      locationLabel,
      precision,
      street,
      phone: optional(text(formData, "phone")),
      email: optional(text(formData, "email")),
      person,
      relationship: text(formData, "relationship") || "self",
      ageBand: optional(text(formData, "ageBand")),
      assignee: ctx.role === "field_worker" ? ctx.userId : optional(text(formData, "assignee")),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      geocodeStatus,
    });
    redirect(`/o/${ctx.slug}/households/${created.id}`);
  } catch (error) {
    return { error: dbMessage(error) };
  }
}

export async function createPerson(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  if (!ctx.can("household.write")) return { error: "You cannot add people." };
  const name = text(formData, "name");
  if (!name) return { error: "Enter a name." };
  try {
    await data.addPerson(ctx, {
      householdId: text(formData, "householdId"),
      name,
      relationship: text(formData, "relationship") || "unrelated",
      ageBand: optional(text(formData, "ageBand")),
      phone: optional(text(formData, "phone")),
      email: optional(text(formData, "email")),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/households/${text(formData, "householdId")}`);
}

export async function createHouseholdNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const body = text(formData, "body");
  if (body.length < 2) return { error: "Write a note." };
  try {
    await data.addHouseholdNote(ctx, text(formData, "householdId"), body);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/households/${text(formData, "householdId")}#notes`);
}

export async function createEnrollment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const programId = text(formData, "programId");
  const definitions = await data.getProgram(ctx, programId);
  if (!definitions) return { error: "Choose a program." };
  const values: Record<string, string> = {};
  for (const field of definitions.fields as unknown as FieldDefinition[]) values[field.key] = text(formData, `field_${field.key}`);
  const checked = validateFieldValues(
    (definitions.fields as unknown as { key: string; label: string; field_type: FieldDefinition["field_type"]; required: boolean; options: string[] }[]).map((field) => ({
      ...field,
      options: Array.isArray(field.options) ? field.options : [],
    })),
    values,
  );
  if (!checked.ok) return { error: checked.errors[0] ?? "Check the program fields." };
  try {
    await data.enrollHousehold(ctx, { householdId: text(formData, "householdId"), programId, values: checked.values });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/households/${text(formData, "householdId")}`);
}

export async function openCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  if (!ctx.can("case.write")) return { error: "You cannot open cases." };
  const summary = text(formData, "summary");
  if (!summary) return { error: "Add a short title. Keep private details in the notes." };
  try {
    const created = await data.createCase(ctx, {
      householdId: text(formData, "householdId"),
      caseTypeId: text(formData, "caseTypeId"),
      priority: text(formData, "priority") || "normal",
      assigneeId: ctx.role === "field_worker" ? ctx.userId : optional(text(formData, "assigneeId")),
      summary,
    });
    redirect(`/o/${ctx.slug}/cases/${created.id}`);
  } catch (error) {
    return { error: dbMessage(error) };
  }
}

export async function changeStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.setCaseStatus(ctx, text(formData, "caseId"), text(formData, "status"), text(formData, "reason"));
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}`);
}

export async function reassignCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  if (!ctx.can("case.assign")) return { error: "You cannot assign cases." };
  try {
    await data.assignCase(ctx, text(formData, "caseId"), text(formData, "assigneeId"));
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}`);
}

export async function createCaseNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const body = text(formData, "body");
  if (body.length < 2) return { error: "Write a note." };
  try {
    await data.addCaseNote(ctx, text(formData, "caseId"), body);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#notes`);
}

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const title = text(formData, "title");
  if (!title) return { error: "Name the task. This title is visible to a volunteer coordinator when you mark it volunteer-visible." };
  try {
    await data.addTask(ctx, {
      caseId: text(formData, "caseId"),
      title,
      dueOn: optional(text(formData, "dueOn")),
      volunteerVisible: formData.get("volunteerVisible") === "on",
      areaLabel: optional(text(formData, "area")),
      householdLabel: optional(text(formData, "householdLabel")),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#tasks`);
}

export async function updateTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.setTaskStatus(ctx, text(formData, "taskId"), text(formData, "status"));
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#tasks`);
}

export async function createAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const place = text(formData, "place");
  const startsAt = text(formData, "startsAt");
  if (!place || !startsAt) return { error: "Add a time and a place label." };
  try {
    await data.addAppointment(ctx, { caseId: text(formData, "caseId"), startsAt, place });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#appointments`);
}

export async function updateAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.setAppointmentStatus(ctx, text(formData, "appointmentId"), text(formData, "status"));
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#appointments`);
}

export async function giveAssistance(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const quantity = Number(text(formData, "quantity"));
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Enter a quantity greater than zero." };
  try {
    await data.recordAssistance(ctx, {
      caseId: text(formData, "caseId"),
      serviceId: text(formData, "serviceId"),
      quantity,
      locationId: optional(text(formData, "locationId")),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#assistance`);
}

export async function createReferralAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const kind = text(formData, "kind");
  const need = text(formData, "need");
  if (!need) return { error: "Describe the need in a short packet. Do not paste the whole case note." };
  try {
    await data.createReferral(ctx, {
      caseId: text(formData, "caseId"),
      kind,
      programId: kind === "internal_program" ? text(formData, "programId") : null,
      siteId: kind === "directory" ? text(formData, "siteId") : null,
      need,
      contact: text(formData, "contact"),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#referrals`);
}

export async function updateReferral(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.setReferralStatus(ctx, text(formData, "referralId"), text(formData, "status"));
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/cases/${text(formData, "caseId")}#referrals`);
}

export async function uploadDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or image." };
  try {
    await data.saveDocument(ctx, {
      householdId: optional(text(formData, "householdId")),
      caseId: optional(text(formData, "caseId")),
      filename: file.name.slice(0, 180),
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  } catch (error) {
    return { error: error instanceof Error && /10 MB|PDF|JPEG/.test(error.message) ? error.message : dbMessage(error) };
  }
  const caseId = text(formData, "caseId");
  const householdId = text(formData, "householdId");
  redirect(caseId ? `/o/${ctx.slug}/cases/${caseId}#documents` : `/o/${ctx.slug}/households/${householdId}#documents`);
}

export async function createProgramAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  if (!ctx.can("program.write")) return { error: "You cannot create programs." };
  const name = text(formData, "name");
  if (!name) return { error: "Name the program." };
  try {
    const id = await data.createProgram(ctx, {
      name,
      description: text(formData, "description"),
      eligibility: text(formData, "eligibility"),
    });
    redirect(`/o/${ctx.slug}/programs/${id}`);
  } catch (error) {
    return { error: dbMessage(error) };
  }
}

export async function createField(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const key = text(formData, "key");
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(key)) return { error: "Use a short lowercase key such as children_count." };
  if (fieldKeyDenied(key)) return { error: "That field collects more than this system allows." };
  try {
    await data.addProgramField(ctx, {
      programId: text(formData, "programId"),
      key,
      label: text(formData, "label"),
      fieldType: text(formData, "fieldType"),
      required: formData.get("required") === "on",
      options: text(formData, "options").split(",").map((item) => item.trim()).filter(Boolean),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/programs/${text(formData, "programId")}`);
}

export async function createService(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const tracks = formData.get("tracks") === "on";
  const itemId = optional(text(formData, "itemId"));
  if (tracks && !itemId) return { error: "Choose the inventory item this service uses." };
  try {
    await data.addProgramService(ctx, {
      programId: text(formData, "programId"),
      name: text(formData, "name"),
      unit: text(formData, "unit") || "each",
      tracks,
      itemId: tracks ? itemId : null,
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/programs/${text(formData, "programId")}`);
}

export async function toggleProgram(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.setProgramActive(ctx, text(formData, "programId"), formData.get("active") === "true");
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/programs/${text(formData, "programId")}`);
}

export async function createItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const threshold = text(formData, "threshold");
  try {
    await data.createItem(ctx, {
      name: text(formData, "name"),
      unit: text(formData, "unit") || "each",
      threshold: threshold ? Number(threshold) : null,
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/inventory`);
}

export async function stockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  const reason = text(formData, "reason") as "receive" | "adjust" | "loss";
  const quantity = Number(text(formData, "quantity"));
  if (!Number.isFinite(quantity) || quantity === 0) return { error: "Enter a quantity." };
  try {
    await data.moveStock(ctx, {
      itemId: text(formData, "itemId"),
      locationId: text(formData, "locationId"),
      quantity: reason === "loss" ? Math.abs(quantity) : quantity,
      reason,
      note: text(formData, "note"),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/inventory`);
}

export async function createVolunteerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.createVolunteer(ctx, {
      name: text(formData, "name"),
      phone: optional(text(formData, "phone")),
      email: optional(text(formData, "email")),
      skills: text(formData, "skills"),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/volunteers`);
}

export async function createShift(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.addShift(ctx, {
      volunteerId: text(formData, "volunteerId"),
      startsAt: text(formData, "startsAt"),
      endsAt: text(formData, "endsAt"),
      roleLabel: text(formData, "roleLabel") || "General",
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/volunteers`);
}

export async function createHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.logHours(ctx, {
      volunteerId: text(formData, "volunteerId"),
      hours: Number(text(formData, "hours")),
      workedOn: text(formData, "workedOn"),
      note: text(formData, "note"),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/volunteers`);
}

export async function createSiteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  if (!ctx.can("directory.write")) return { error: "You cannot edit the directory." };
  const name = text(formData, "name");
  if (!name) return { error: "Name the service." };
  const street = optional(text(formData, "street"));
  const area = text(formData, "area");
  let lat = Number(text(formData, "lat"));
  let lng = Number(text(formData, "lng"));
  let geocodeStatus = "untried";
  if (Number.isFinite(lat) && Number.isFinite(lng) && text(formData, "lat")) geocodeStatus = "manual";
  else {
    const found = await geocodeAddress([street, area].filter(Boolean).join(", "));
    if (found) {
      lat = found.lat;
      lng = found.lng;
      geocodeStatus = "geocoded";
    } else {
      lat = Number.NaN;
      lng = Number.NaN;
      geocodeStatus = street ? "unavailable" : "untried";
    }
  }
  try {
    await data.createSite(ctx, {
      name,
      category: text(formData, "category") || "General",
      eligibility: text(formData, "eligibility"),
      hours: text(formData, "hours"),
      phone: optional(text(formData, "phone")),
      area,
      street,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      geocodeStatus,
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/directory`);
}

export async function saveOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  if (!ctx.can("org.manage")) return { error: "You cannot change organization settings." };
  try {
    await data.updateOrganization(ctx, {
      name: text(formData, "name"),
      timezone: text(formData, "timezone"),
      householdPrefix: text(formData, "householdPrefix").toUpperCase(),
      casePrefix: text(formData, "casePrefix").toUpperCase(),
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/settings`);
}

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.removeMember(ctx, text(formData, "userId"));
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/settings`);
}

export async function transferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    await data.transferOwnership(ctx, text(formData, "userId"));
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect("/orgs");
}

export async function purgeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await orgFrom(formData);
  try {
    if (formData.get("cancel") === "1") await data.cancelPurge(ctx);
    else await data.schedulePurge(ctx);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect(`/o/${ctx.slug}/settings`);
}

export async function markRead(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const ctx = await requireOrg(slug);
  await data.markNotificationsRead(ctx);
  redirect(`/o/${slug}/notifications`);
}

export async function runMaintenance() {
  const rows = await sql<{ storage_key: string }[]>`select * from app.purge_due_organizations()`;
  await data.purgeStoredFiles(rows.map((row) => row.storage_key));
  await sql`select app.enqueue_appointment_reminders()`;
}
