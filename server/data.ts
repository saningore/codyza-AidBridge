import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OrgContext } from "@/server/context";
import { withOrg } from "@/server/db";
import { likePattern } from "@/lib/format";
import { sniffDocument, MAX_DOCUMENT_BYTES } from "@/lib/files";

function storagePath(key: string) {
  const root = path.resolve(process.cwd(), "storage");
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Invalid storage path");
  return full;
}


export async function dashboard(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const cases = await tx<{ status: string; total: string }[]>`
      select status, count(*)::text as total from cases group by status order by status
    `;
    const tasks = await tx<{ id: string; title: string; due_on: string | null; code: string }[]>`
      select t.id, t.title, t.due_on::text, c.code
      from tasks t
      join cases c on c.id = t.case_id
      where t.status = 'open'
      order by t.due_on nulls last
      limit 8
    `;
    const appointments = await tx<{ id: string; place_label: string; starts_at: Date; code: string }[]>`
      select a.id, a.place_label, a.starts_at, c.code
      from appointments a
      join cases c on c.id = a.case_id
      where a.status = 'scheduled' and a.starts_at > now() - interval '1 day'
      order by a.starts_at
      limit 6
    `;
    const unreadRows = await tx<{ total: string }[]>`select count(*)::text as total from notifications where read_at is null`;
    const stock = ctx.can("inventory.read")
      ? await tx<{ item_name: string; on_hand: string; low_stock_threshold: string | null }[]>`
          select item_name, on_hand::text, low_stock_threshold::text
          from app.report_inventory()
          where low_stock_threshold is not null and on_hand <= low_stock_threshold
        `
      : [];
    const unread = unreadRows;
    return { cases, tasks, appointments, unread: unread[0]?.total ?? "0", stock };
  });
}

export async function listHouseholds(ctx: OrgContext, query: string) {
  const pattern = likePattern(query.trim());
  return withOrg(ctx.userId, ctx.orgId, (tx) =>
    query.trim().length >= 2
      ? tx`
          select id, code, label, location_label, location_precision
          from v_households
          where code ilike ${pattern} escape '\\'
             or label ilike ${pattern} escape '\\'
             or location_label ilike ${pattern} escape '\\'
          order by code desc
          limit 50
        `
      : tx`
          select id, code, label, location_label, location_precision
          from v_households
          order by created_at desc
          limit 50
        `,
  );
}

export async function getHousehold(ctx: OrgContext, id: string) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const rows = await tx`select * from v_households where id = ${id}`;
    const household = rows[0];
    if (!household) return null;
    const people = await tx`select * from v_people where household_id = ${id} order by is_primary desc, preferred_name`;
    const notes = await tx`
      select n.id, n.body, n.created_at, u.name as author
      from household_notes n
      join users u on u.id = n.author_id
      where n.household_id = ${id}
      order by n.created_at desc
    `;
    const enrollments = await tx`
      select e.id, e.status, e.started_on::text, e.field_values, p.name as program_name, e.program_id
      from enrollments e
      join programs p on p.id = e.program_id
      where e.household_id = ${id}
      order by e.started_on desc
    `;
    const cases = await tx`
      select id, code, status, priority, summary
      from cases
      where household_id = ${id}
      order by opened_on desc
    `;
    const documents = await tx`
      select id, filename, mime, size_bytes, created_at
      from documents
      where household_id = ${id} and deleted_at is null
      order by created_at desc
    `;
    const programs = await tx`select id, name from programs where active order by name`;
    const fields = await tx`
      select program_id, key, label, field_type, required, options
      from program_fields
      order by position, label
    `;
    const workers = await tx`
      select u.id, u.name, m.role
      from memberships m
      join users u on u.id = m.user_id
      where m.status = 'active' and m.role <> 'viewer'
      order by u.name
    `;
    return { household, people, notes, enrollments, cases, documents, programs, fields, workers };
  });
}

export async function listCases(ctx: OrgContext, status: string) {
  return withOrg(ctx.userId, ctx.orgId, (tx) =>
    status
      ? tx`
          select c.id, c.code, c.status, c.priority, c.summary, c.opened_on::text, h.label as household, h.code as household_code
          from cases c
          join v_households h on h.id = c.household_id
          where c.status = ${status}
          order by c.updated_at desc
          limit 80
        `
      : tx`
          select c.id, c.code, c.status, c.priority, c.summary, c.opened_on::text, h.label as household, h.code as household_code
          from cases c
          join v_households h on h.id = c.household_id
          order by c.updated_at desc
          limit 80
        `,
  );
}

export async function getCase(ctx: OrgContext, id: string) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const rows = await tx`
      select c.*, h.label as household_label, h.code as household_code, h.id as household_id,
        t.name as type_name, u.name as assignee_name
      from cases c
      join v_households h on h.id = c.household_id
      join case_types t on t.id = c.case_type_id
      left join users u on u.id = c.assignee_id
      where c.id = ${id}
    `;
    const record = rows[0];
    if (!record) return null;
    const notes = await tx`
      select n.id, n.body, n.created_at, u.name as author
      from case_notes n join users u on u.id = n.author_id
      where n.case_id = ${id} order by n.created_at desc
    `;
    const tasks = await tx`select * from tasks where case_id = ${id} order by created_at desc`;
    const appointments = await tx`select * from appointments where case_id = ${id} order by starts_at`;
    const services = await tx`
      select ps.id, ps.name, ps.unit, ps.tracks_inventory, ps.item_id, p.name as program_name
      from program_services ps
      join programs p on p.id = ps.program_id
      where ps.active and p.active
      order by p.name, ps.name
    `;
    const assistance = await tx`
      select a.id, a.quantity, a.served_on::text, ps.name as service_name, ps.unit
      from assistance_lines a
      join program_services ps on ps.id = a.program_service_id
      where a.case_id = ${id}
      order by a.created_at desc
    `;
    const referrals = await tx`
      select r.id, r.kind, r.status, r.packet_need, r.packet_contact, r.created_at,
        p.name as program_name, s.name as site_name
      from referrals r
      left join programs p on p.id = r.program_id
      left join service_sites s on s.id = r.service_site_id
      where r.case_id = ${id}
      order by r.created_at desc
    `;
    const documents = await tx`
      select id, filename, mime, size_bytes, created_at
      from documents where case_id = ${id} and deleted_at is null
      order by created_at desc
    `;
    const timeline = await tx`
      select a.action, a.created_at, a.before->>'status' as before_status, a.after->>'status' as after_status, u.name as actor
      from activity_events a
      left join users u on u.id = a.actor_id
      where a.entity_type = 'case' and a.entity_id = ${id}
      order by a.created_at desc
      limit 40
    `;
    const programs = await tx`select id, name from programs where active order by name`;
    const sites = await tx`select id, name from service_sites where active order by name`;
    const workers = await tx`
      select u.id, u.name from memberships m
      join users u on u.id = m.user_id
      where m.status = 'active' and m.role in ('owner','administrator','case_worker','field_worker')
      order by u.name
    `;
    const locations = await tx`select id, name from stock_locations order by name`;
    return {
      record, notes, tasks, appointments, services, assistance, referrals, documents, timeline, programs, sites, workers, locations,
    };
  });
}

export async function caseFormOptions(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const households = await tx`select id, code, label from v_households order by label limit 200`;
    const types = await tx`select id, name from case_types where active order by name`;
    const workers = await tx`
      select u.id, u.name from memberships m
      join users u on u.id = m.user_id
      where m.status = 'active' and m.role in ('owner','administrator','case_worker','field_worker')
      order by u.name
    `;
    return { households, types, workers };
  });
}

export async function listPrograms(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    select p.id, p.name, p.description, p.eligibility, p.active,
      (select count(*)::text from program_services s where s.program_id = p.id) as services
    from programs p
    order by p.active desc, p.name
  `);
}

export async function getProgram(ctx: OrgContext, id: string) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const rows = await tx`select * from programs where id = ${id}`;
    const program = rows[0];
    if (!program) return null;
    const fields = await tx`select * from program_fields where program_id = ${id} order by position, label`;
    const services = await tx`
      select s.*, i.name as item_name
      from program_services s
      left join items i on i.id = s.item_id
      where s.program_id = ${id}
      order by s.name
    `;
    const items = await tx`select id, name from items where active order by name`;
    return { program, fields, services, items };
  });
}

export async function listInventory(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const items = await tx`select * from app.report_inventory()`;
    const locations = await tx`select id, name from stock_locations order by name`;
    const movements = ctx.can("inventory.write") || ctx.can("audit.read")
      ? await tx`
          select m.id, m.quantity, m.reason, m.note, m.created_at, i.name as item_name, l.name as location_name
          from stock_movements m
          join items i on i.id = m.item_id
          join stock_locations l on l.id = m.location_id
          order by m.created_at desc
          limit 30
        `
      : [];
    const catalog = ctx.can("inventory.write")
      ? await tx`select id, name, unit from items where active order by name`
      : [];
    return { items, locations, movements, catalog };
  });
}

export async function listVolunteers(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const volunteers = await tx`select * from volunteers order by active desc, name`;
    const shifts = await tx`
      select s.id, s.starts_at, s.ends_at, s.role_label, v.name
      from shifts s join volunteers v on v.id = s.volunteer_id
      where s.starts_at > now() - interval '1 day'
      order by s.starts_at
      limit 20
    `;
    const tasks = await tx`
      select id, title, due_on::text, area_label, household_label, status
      from tasks
      where volunteer_visible
      order by due_on nulls last
      limit 20
    `;
    return { volunteers, shifts, tasks };
  });
}

export async function listDirectory(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    select id, name, category, eligibility, hours_label, phone, area_label, street_address,
      last_verified_on::text, active,
      st_y(geom::geometry) as lat, st_x(geom::geometry) as lng, geocode_status
    from service_sites
    order by active desc, name
  `);
}

export async function mapPoints(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const households = ctx.can("household.read")
      ? await tx<{ id: string; title: string; subtitle: string; lat: number; lng: number; href: string }[]>`
          select id, label as title, code as subtitle, lat, lng
          from v_households
          where lat is not null and lng is not null
        `
      : [];
    const sites = ctx.can("directory.read")
      ? await tx<{ id: string; title: string; subtitle: string; lat: number; lng: number }[]>`
          select id, name as title, coalesce(area_label, category) as subtitle,
            st_y(geom::geometry) as lat, st_x(geom::geometry) as lng
          from service_sites
          where geom is not null and active
        `
      : [];
    return {
      households: households.map((row) => ({ ...row, kind: "household" as const })),
      sites: sites.map((row) => ({ ...row, kind: "site" as const })),
    };
  });
}

export async function reports(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const cases = await tx`select * from app.report_cases()`;
    const services = await tx`select * from app.report_services()`;
    const inventory = await tx`select * from app.report_inventory()`;
    const hours = await tx`select * from app.report_volunteer_hours()`;
    return { cases, services, inventory, hours };
  });
}

export async function searchAll(ctx: OrgContext, query: string) {
  const pattern = likePattern(query.trim());
  if (query.trim().length < 2) return { households: [], cases: [], volunteers: [], items: [], sites: [] };
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const households = await tx`
      select id, code, label, location_label from v_households
      where code ilike ${pattern} escape '\\' or label ilike ${pattern} escape '\\' or location_label ilike ${pattern} escape '\\'
      limit 15
    `;
    const cases = await tx`
      select id, code, summary, status from cases
      where code ilike ${pattern} escape '\\' or summary ilike ${pattern} escape '\\'
      limit 15
    `;
    const volunteers = await tx`
      select id, name, skills from volunteers
      where name ilike ${pattern} escape '\\' or skills ilike ${pattern} escape '\\'
      limit 10
    `;
    const items = await tx`select id, name from items where name ilike ${pattern} escape '\\' limit 10`;
    const sites = await tx`select id, name, category from service_sites where name ilike ${pattern} escape '\\' or category ilike ${pattern} escape '\\' limit 10`;
    return { households, cases, volunteers, items, sites };
  });
}

export async function listNotifications(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    select id, kind, title, body, read_at, created_at
    from notifications
    order by created_at desc
    limit 50
  `);
}

export async function listAudit(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    select a.id, a.action, a.entity_type, a.created_at,
      a.before->>'status' as before_status,
      a.after->>'status' as after_status,
      coalesce(a.after->>'code', a.before->>'code') as code,
      u.name as actor
    from activity_events a
    left join users u on u.id = a.actor_id
    order by a.created_at desc
    limit 80
  `);
}

export async function listMembers(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const members = await tx`
      select u.id, u.name, u.email::text, m.role
      from memberships m join users u on u.id = m.user_id
      where m.status = 'active'
      order by u.name
    `;
    const invites = await tx`
      select id, email::text, role, expires_at
      from invitations
      where used_at is null and expires_at > now()
      order by created_at desc
    `;
    return { members, invites };
  });
}

export async function saveHousehold(
  ctx: OrgContext,
  input: {
    label: string;
    locationLabel: string;
    precision: string;
    street: string | null;
    phone: string | null;
    email: string | null;
    person: string;
    relationship: string;
    ageBand: string | null;
    assignee: string | null;
    lat: number | null;
    lng: number | null;
    geocodeStatus: string;
  },
) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const rows = await tx<{ id: string; code: string }[]>`
      insert into households (
        organization_id, label, location_label, location_precision, street_address,
        phone, email, geom, geocode_status, assigned_worker_id, consent_at, consent_by
      ) values (
        ${ctx.orgId}, ${input.label}, ${input.locationLabel}, ${input.precision}, ${input.street},
        ${input.phone}, ${input.email},
        case
          when ${input.lat}::float8 is null or ${input.lng}::float8 is null then null
          else ST_SetSRID(ST_MakePoint(${input.lng}::float8, ${input.lat}::float8), 4326)::geography
        end,
        ${input.geocodeStatus},
        ${input.assignee}, now(), ${ctx.userId}
      )
      returning id, code
    `;
    const created = rows[0];
    await tx`
      insert into people (organization_id, household_id, preferred_name, relationship, age_band, phone, email, is_primary)
      values (
        ${ctx.orgId}, ${created.id}, ${input.person}, ${input.relationship}, ${input.ageBand},
        ${input.phone}, ${input.email}, true
      )
    `;
    return created;
  });
}

export async function addPerson(
  ctx: OrgContext,
  input: { householdId: string; name: string; relationship: string; ageBand: string | null; phone: string | null; email: string | null },
) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into people (organization_id, household_id, preferred_name, relationship, age_band, phone, email, is_primary)
    values (${ctx.orgId}, ${input.householdId}, ${input.name}, ${input.relationship}, ${input.ageBand}, ${input.phone}, ${input.email}, false)
  `);
}

export async function addHouseholdNote(ctx: OrgContext, householdId: string, body: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into household_notes (organization_id, household_id, author_id, body)
    values (${ctx.orgId}, ${householdId}, ${ctx.userId}, ${body})
  `);
}

export async function enrollHousehold(
  ctx: OrgContext,
  input: { householdId: string; programId: string; values: Record<string, string> },
) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into enrollments (organization_id, household_id, program_id, field_values)
    values (${ctx.orgId}, ${input.householdId}, ${input.programId}, ${JSON.stringify(input.values)}::jsonb)
  `);
}

export async function createCase(
  ctx: OrgContext,
  input: { householdId: string; caseTypeId: string; priority: string; assigneeId: string | null; summary: string },
) {
  const rows = await withOrg(ctx.userId, ctx.orgId, (tx) => tx<{ id: string; code: string }[]>`
    insert into cases (organization_id, case_type_id, household_id, priority, assignee_id, summary, status)
    values (${ctx.orgId}, ${input.caseTypeId}, ${input.householdId}, ${input.priority}, ${input.assigneeId}, ${input.summary}, 'new')
    returning id, code
  `);
  return rows[0];
}

export async function setCaseStatus(ctx: OrgContext, id: string, status: string, reason: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    update cases
    set status = ${status}, last_transition_reason = ${reason || null}
    where id = ${id}
  `);
}

export async function assignCase(ctx: OrgContext, id: string, assigneeId: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    update cases set assignee_id = ${assigneeId} where id = ${id}
  `);
}

export async function addCaseNote(ctx: OrgContext, caseId: string, body: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into case_notes (organization_id, case_id, author_id, body)
    values (${ctx.orgId}, ${caseId}, ${ctx.userId}, ${body})
  `);
}

export async function addTask(
  ctx: OrgContext,
  input: { caseId: string; title: string; dueOn: string | null; volunteerVisible: boolean; areaLabel: string | null; householdLabel: string | null },
) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into tasks (organization_id, case_id, title, due_on, volunteer_visible, area_label, household_label)
    values (
      ${ctx.orgId}, ${input.caseId}, ${input.title}, ${input.dueOn}, ${input.volunteerVisible},
      ${input.areaLabel}, ${input.householdLabel}
    )
  `);
}

export async function setTaskStatus(ctx: OrgContext, id: string, status: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`update tasks set status = ${status} where id = ${id}`);
}

export async function addAppointment(ctx: OrgContext, input: { caseId: string; startsAt: string; place: string }) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into appointments (organization_id, case_id, starts_at, place_label)
    values (${ctx.orgId}, ${input.caseId}, ${input.startsAt}, ${input.place})
  `);
}

export async function setAppointmentStatus(ctx: OrgContext, id: string, status: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`update appointments set status = ${status} where id = ${id}`);
}

export async function recordAssistance(
  ctx: OrgContext,
  input: { caseId: string; serviceId: string; quantity: number; locationId: string | null },
) {
  await withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const services = await tx<{ tracks_inventory: boolean; item_id: string | null }[]>`
      select tracks_inventory, item_id from program_services where id = ${input.serviceId} and active
    `;
    const service = services[0];
    if (!service) throw new Error("unknown service");
    const lines = await tx<{ id: string }[]>`
      insert into assistance_lines (
        organization_id, case_id, program_service_id, quantity, item_id, location_id, household_code, actor_id
      ) values (
        ${ctx.orgId}, ${input.caseId}, ${input.serviceId}, ${input.quantity},
        ${service.item_id}, ${service.tracks_inventory ? input.locationId : null}, '', ${ctx.userId}
      )
      returning id
    `;
    if (service.tracks_inventory) {
      if (!service.item_id || !input.locationId) throw new Error("Choose a storage location for this stocked service.");
      await tx`
        insert into stock_movements (organization_id, item_id, location_id, quantity, reason, assistance_id, actor_id)
        values (${ctx.orgId}, ${service.item_id}, ${input.locationId}, ${-input.quantity}, 'issue', ${lines[0].id}, ${ctx.userId})
      `;
    }
  });
}

export async function createProgram(
  ctx: OrgContext,
  input: { name: string; description: string; eligibility: string },
) {
  const rows = await withOrg(ctx.userId, ctx.orgId, (tx) => tx<{ id: string }[]>`
    insert into programs (organization_id, name, description, eligibility)
    values (${ctx.orgId}, ${input.name}, ${input.description}, ${input.eligibility})
    returning id
  `);
  return rows[0].id;
}

export async function addProgramField(
  ctx: OrgContext,
  input: { programId: string; key: string; label: string; fieldType: string; required: boolean; options: string[] },
) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into program_fields (organization_id, program_id, key, label, field_type, required, options)
    values (
      ${ctx.orgId}, ${input.programId}, ${input.key}, ${input.label}, ${input.fieldType},
      ${input.required}, ${JSON.stringify(input.options)}::jsonb
    )
  `);
}

export async function addProgramService(
  ctx: OrgContext,
  input: { programId: string; name: string; unit: string; tracks: boolean; itemId: string | null },
) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into program_services (organization_id, program_id, name, unit, tracks_inventory, item_id)
    values (${ctx.orgId}, ${input.programId}, ${input.name}, ${input.unit}, ${input.tracks}, ${input.itemId})
  `);
}

export async function setProgramActive(ctx: OrgContext, id: string, active: boolean) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`update programs set active = ${active} where id = ${id}`);
}

export async function createItem(ctx: OrgContext, input: { name: string; unit: string; threshold: number | null }) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into items (organization_id, name, unit, low_stock_threshold)
    values (${ctx.orgId}, ${input.name}, ${input.unit}, ${input.threshold})
  `);
}

export async function moveStock(
  ctx: OrgContext,
  input: { itemId: string; locationId: string; quantity: number; reason: "receive" | "adjust" | "loss"; note: string },
) {
  const signed = input.reason === "loss" ? -Math.abs(input.quantity) : input.quantity;
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into stock_movements (organization_id, item_id, location_id, quantity, reason, note, actor_id)
    values (${ctx.orgId}, ${input.itemId}, ${input.locationId}, ${signed}, ${input.reason}, ${input.note}, ${ctx.userId})
  `);
}

export async function createVolunteer(ctx: OrgContext, input: { name: string; phone: string | null; email: string | null; skills: string }) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into volunteers (organization_id, name, phone, email, skills)
    values (${ctx.orgId}, ${input.name}, ${input.phone}, ${input.email}, ${input.skills})
  `);
}

export async function addShift(ctx: OrgContext, input: { volunteerId: string; startsAt: string; endsAt: string; roleLabel: string }) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into shifts (organization_id, volunteer_id, starts_at, ends_at, role_label)
    values (${ctx.orgId}, ${input.volunteerId}, ${input.startsAt}, ${input.endsAt}, ${input.roleLabel})
  `);
}

export async function logHours(ctx: OrgContext, input: { volunteerId: string; hours: number; workedOn: string; note: string }) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into volunteer_hours (organization_id, volunteer_id, hours, worked_on, note)
    values (${ctx.orgId}, ${input.volunteerId}, ${input.hours}, ${input.workedOn}, ${input.note})
  `);
}

export async function createSite(
  ctx: OrgContext,
  input: {
    name: string;
    category: string;
    eligibility: string;
    hours: string;
    phone: string | null;
    area: string;
    street: string | null;
    lat: number | null;
    lng: number | null;
    geocodeStatus: string;
  },
) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into service_sites (
        organization_id, name, category, eligibility, hours_label, phone, area_label, street_address,
        geom, geocode_status, last_verified_on
      ) values (
        ${ctx.orgId}, ${input.name}, ${input.category}, ${input.eligibility}, ${input.hours}, ${input.phone},
        ${input.area}, ${input.street},
        case
          when ${input.lat}::float8 is null or ${input.lng}::float8 is null then null
          else ST_SetSRID(ST_MakePoint(${input.lng}::float8, ${input.lat}::float8), 4326)::geography
        end,
        ${input.geocodeStatus}, current_date
      )
      returning id
    `;
    return rows[0].id;
  });
}

export async function createReferral(
  ctx: OrgContext,
  input: { caseId: string; kind: string; programId: string | null; siteId: string | null; need: string; contact: string },
) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into referrals (organization_id, case_id, kind, program_id, service_site_id, packet_need, packet_contact, status, created_by)
    values (
      ${ctx.orgId}, ${input.caseId}, ${input.kind}, ${input.programId}, ${input.siteId},
      ${input.need}, ${input.contact}, 'sent', ${ctx.userId}
    )
  `);
}

export async function setReferralStatus(ctx: OrgContext, id: string, status: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`update referrals set status = ${status} where id = ${id}`);
}

export async function saveDocument(ctx: OrgContext, input: { householdId: string | null; caseId: string | null; filename: string; mime: string; bytes: Buffer }) {
  if (input.bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Files are limited to 10 MB.");
  const sniffed = sniffDocument(input.bytes, input.mime);
  if (!sniffed) throw new Error("Upload a PDF, JPEG, PNG, or WebP file.");
  const id = crypto.randomUUID();
  const key = `${ctx.orgId}/${id}`;
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into documents (id, organization_id, household_id, case_id, storage_key, filename, mime, size_bytes, uploaded_by)
    values (${id}, ${ctx.orgId}, ${input.householdId}, ${input.caseId}, ${key}, ${input.filename}, ${sniffed}, ${input.bytes.length}, ${ctx.userId})
  `);
  const full = storagePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  try {
    await writeFile(full, input.bytes);
  } catch (error) {
    await withOrg(ctx.userId, ctx.orgId, (tx) => tx`update documents set deleted_at = now() where id = ${id}`);
    throw error;
  }
  return id;
}

export async function readDocument(ctx: OrgContext, id: string) {
  const rows = await withOrg(ctx.userId, ctx.orgId, (tx) => tx<{ storage_key: string; filename: string; mime: string }[]>`
    select storage_key, filename, mime from documents where id = ${id} and deleted_at is null
  `);
  const row = rows[0];
  if (!row) return null;
  const bytes = await readFile(storagePath(row.storage_key));
  return { ...row, bytes };
}

export async function markNotificationsRead(ctx: OrgContext) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    update notifications set read_at = now() where read_at is null
  `);
}

export async function updateOrganization(
  ctx: OrgContext,
  input: { name: string; timezone: string; householdPrefix: string; casePrefix: string },
) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    update organizations
    set name = ${input.name}, timezone = ${input.timezone},
        household_prefix = ${input.householdPrefix}, case_prefix = ${input.casePrefix}
    where id = ${ctx.orgId}
  `);
}

export async function inviteMember(ctx: OrgContext, input: { email: string; role: string; tokenHash: string }) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`
    insert into invitations (organization_id, email, role, token_hash, expires_at, invited_by)
    values (${ctx.orgId}, ${input.email}, ${input.role}, ${input.tokenHash}, now() + interval '7 days', ${ctx.userId})
  `);
}

export async function removeMember(ctx: OrgContext, userId: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`select app.remove_member(${userId}::uuid)`);
}

export async function transferOwnership(ctx: OrgContext, userId: string) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`select app.transfer_ownership(${userId}::uuid)`);
}

export async function schedulePurge(ctx: OrgContext) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`select app.schedule_purge()`);
}

export async function cancelPurge(ctx: OrgContext) {
  await withOrg(ctx.userId, ctx.orgId, (tx) => tx`select app.cancel_purge()`);
}

export async function fieldSnapshot(ctx: OrgContext) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const cases = await tx`
      select c.id, c.code, c.status, c.summary, c.priority, h.label as household, h.code as household_code
      from cases c
      join v_households h on h.id = c.household_id
      where c.status <> 'closed'
      order by c.updated_at desc
      limit 40
    `;
    const services = await tx`
      select ps.id, ps.name, ps.unit, ps.tracks_inventory
      from program_services ps
      join programs p on p.id = ps.program_id
      where ps.active and p.active
      order by ps.name
    `;
    return {
      savedAt: new Date().toISOString(),
      orgName: ctx.orgName,
      orgSlug: ctx.slug,
      cases,
      services,
    };
  });
}

export async function applyOfflineMutation(
  ctx: OrgContext,
  input: { idempotencyKey: string; kind: string; payload: Record<string, unknown> },
) {
  return withOrg(ctx.userId, ctx.orgId, async (tx) => {
    const existing = await tx<{ status: string; result: Record<string, unknown> }[]>`
      select status, result from client_mutations
      where user_id = ${ctx.userId} and idempotency_key = ${input.idempotencyKey}
    `;
    if (existing[0]) return existing[0];

    let status = "applied";
    let result: Record<string, unknown> = {};
    if (input.kind === "case_note") {
      const caseId = String(input.payload.caseId ?? "");
      const body = String(input.payload.body ?? "").trim();
      if (!body) throw new Error("Write a note before saving.");
      await tx`
        insert into case_notes (organization_id, case_id, author_id, body)
        values (${ctx.orgId}, ${caseId}, ${ctx.userId}, ${body})
      `;
      result = { caseId };
    } else if (input.kind === "case_status") {
      const caseId = String(input.payload.caseId ?? "");
      const next = String(input.payload.status ?? "");
      const base = String(input.payload.baseStatus ?? "");
      const current = await tx<{ status: string }[]>`select status from cases where id = ${caseId}`;
      if (!current[0]) throw new Error("That case is not available.");
      if (current[0].status !== base) {
        status = "conflict";
        result = { status: current[0].status, message: "The case changed while this phone was offline." };
      } else {
        await tx`
          update cases set status = ${next}, last_transition_reason = ${String(input.payload.reason ?? "") || null}
          where id = ${caseId}
        `;
        result = { status: next };
      }
    } else if (input.kind === "assistance") {
      const caseId = String(input.payload.caseId ?? "");
      const serviceId = String(input.payload.serviceId ?? "");
      const quantity = Number(input.payload.quantity ?? 0);
      const locationId = input.payload.locationId ? String(input.payload.locationId) : null;
      const services = await tx<{ tracks_inventory: boolean; item_id: string | null }[]>`
        select tracks_inventory, item_id from program_services where id = ${serviceId}
      `;
      const service = services[0];
      if (!service || quantity <= 0) throw new Error("Choose a service and a quantity.");
      try {
        const assistanceId = await tx.savepoint(async (sp) => {
          const lines = await sp<{ id: string }[]>`
            insert into assistance_lines (
              organization_id, case_id, program_service_id, quantity, item_id, location_id, household_code, actor_id
            ) values (
              ${ctx.orgId}, ${caseId}, ${serviceId}, ${quantity}, ${service.item_id},
              ${service.tracks_inventory ? locationId : null}, '', ${ctx.userId}
            ) returning id
          `;
          if (service.tracks_inventory && service.item_id && locationId) {
            await sp`
              insert into stock_movements (organization_id, item_id, location_id, quantity, reason, assistance_id, actor_id)
              values (${ctx.orgId}, ${service.item_id}, ${locationId}, ${-quantity}, 'issue', ${lines[0].id}, ${ctx.userId})
            `;
          }
          return lines[0].id;
        });
        result = { assistanceId };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/insufficient stock/i.test(message)) {
          status = "conflict";
          result = { message: "Not enough stock remained when this phone reconnected." };
        } else {
          throw error;
        }
      }
    } else {
      throw new Error("Unknown offline change.");
    }

    await tx`
      insert into client_mutations (organization_id, user_id, idempotency_key, kind, payload, status, result)
      values (
        ${ctx.orgId}, ${ctx.userId}, ${input.idempotencyKey}, ${input.kind},
        ${JSON.stringify(input.payload)}::jsonb, ${status}, ${JSON.stringify(result)}::jsonb
      )
    `;
    return { status, result };
  });
}

export async function purgeStoredFiles(keys: string[]) {
  await Promise.all(keys.filter(Boolean).map(async (key) => rm(storagePath(key), { force: true })));
}
