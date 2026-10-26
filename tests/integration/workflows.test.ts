import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { ids } from "../../db/ids";
import { applyOfflineMutation, searchAll } from "../../server/data";
import { asUser, orgContext } from "./helpers";

const app = postgres(process.env.DATABASE_URL!, { max: 4 });
const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 });

const maria = () => orgContext({
  userId: ids.maria,
  email: "maria.santos@foodbank.test",
  name: "Maria Santos",
  orgId: ids.foodOrg,
  orgName: "Community Food Bank",
  slug: "food-bank",
  role: "case_worker",
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("tenant boundaries", () => {
  it("keeps the same household code in two organizations", async () => {
    const rows = await admin<{ total: string }[]>`
      select count(*)::text as total from households where code = 'H-1042'
    `;
    expect(rows[0].total).toBe("2");
    const rural = await asUser(app, ids.alex, ids.ruralOrg, (tx) => tx<{ label: string }[]>`
      select label from v_households order by label
    `);
    expect(rural.map((row) => row.label)).toEqual(["Carter household"]);
  });

  it("shows a field worker only the assigned case", async () => {
    const rows = await asUser(app, ids.sam, ids.foodOrg, (tx) => tx<{ code: string }[]>`
      select code from cases order by code
    `);
    expect(rows.map((row) => row.code)).toEqual(["AC-2042"]);
  });

  it("hides documents, notes, and another person's alerts", async () => {
    const viewerDocs = await asUser(app, ids.jordan, ids.foodOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from documents
    `);
    const workerDocs = await asUser(app, ids.maria, ids.foodOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from documents
    `);
    const inventoryNotes = await asUser(app, ids.lee, ids.foodOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from case_notes
    `);
    const ledger = await asUser(app, ids.lee, ids.foodOrg, (tx) => tx<{ household_code: string }[]>`
      select household_code from v_assistance_ledger
    `);
    const jordanRice = await asUser(app, ids.jordan, ids.foodOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from notifications where body ilike '%Rice%'
    `);
    const leeRice = await asUser(app, ids.lee, ids.foodOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from notifications where body ilike '%Rice%'
    `);
    expect(viewerDocs[0].total).toBe("0");
    expect(Number(workerDocs[0].total)).toBeGreaterThan(0);
    expect(inventoryNotes[0].total).toBe("0");
    expect(ledger.map((row) => row.household_code)).toContain("H-1042");
    expect(jordanRice[0].total).toBe("0");
    expect(Number(leeRice[0].total)).toBeGreaterThan(0);
  });

  it("redacts names on the people view and drops address-precision coordinates", async () => {
    const people = await asUser(app, ids.jordan, ids.foodOrg, (tx) => tx<{ preferred_name: string; phone: string | null }[]>`
      select preferred_name, phone from v_people where household_id = ${ids.henderson} order by is_primary desc
    `);
    expect(people.map((row) => row.preferred_name)).toEqual(["Self", "Child"]);
    expect(people.every((row) => row.phone == null)).toBe(true);

    await admin`
      update households
      set street_address = '1 Test Lane', location_precision = 'address'
      where id = ${ids.henderson}
    `;
    try {
      const viewer = await asUser(app, ids.jordan, ids.foodOrg, (tx) => tx<{ street_address: string | null; lat: number | null }[]>`
        select street_address, lat from v_households where id = ${ids.henderson}
      `);
      const worker = await asUser(app, ids.maria, ids.foodOrg, (tx) => tx<{ street_address: string | null; lat: number | null }[]>`
        select street_address, lat from v_households where id = ${ids.henderson}
      `);
      expect(viewer[0].street_address).toBeNull();
      expect(viewer[0].lat).toBeNull();
      expect(worker[0].street_address).toBe("1 Test Lane");
      expect(worker[0].lat).not.toBeNull();
    } finally {
      await admin`
        update households
        set street_address = null, location_precision = 'neighborhood'
        where id = ${ids.henderson}
      `;
    }
  });
});

describe("database privileges", () => {
  it("refuses password hashes, sessions, and deletes for the application role", async () => {
    await expect(app`select password_hash from users`).rejects.toThrow(/permission denied/i);
    await expect(app`select mfa_secret from users`).rejects.toThrow(/permission denied/i);
    await expect(app`select id from sessions`).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(app, ids.june, ids.foodOrg, (tx) => tx`delete from households where id = ${ids.brooks}`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("rolls back a code allocation that does not commit", async () => {
    const before = await admin<{ value: number }[]>`
      select value from counters where organization_id = ${ids.foodOrg} and kind = 'household'
    `;
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.user_id', ${ids.maria}, true)`;
        await tx`select set_config('app.org_id', ${ids.foodOrg}, true)`;
        const rows = await tx<{ allocate_code: string }[]>`
          select app.allocate_code(${ids.foodOrg}::uuid, 'household') as allocate_code
        `;
        expect(rows[0].allocate_code).toBe(`H-${Number(before[0].value) + 1}`);
        throw new Error("rollback-check");
      }),
    ).rejects.toThrow("rollback-check");
    const after = await admin<{ value: number }[]>`
      select value from counters where organization_id = ${ids.foodOrg} and kind = 'household'
    `;
    expect(Number(after[0].value)).toBe(Number(before[0].value));
  });
});

describe("record rules", () => {
  it("blocks a field worker from reassigning a case", async () => {
    await expect(
      asUser(app, ids.sam, ids.foodOrg, (tx) => tx`
        update cases set assignee_id = ${ids.maria} where id = ${ids.caseSam}
      `),
    ).rejects.toThrow(/cannot reassign/i);
    const rows = await admin<{ assignee_id: string }[]>`select assignee_id from cases where id = ${ids.caseSam}`;
    expect(rows[0].assignee_id).toBe(ids.sam);
  });

  it("requires an owner or administrator and a reason to reopen a closed case", async () => {
    const caseType = await admin<{ id: string }[]>`
      select id from case_types where organization_id = ${ids.foodOrg} and name = 'Food Assistance'
    `;
    const created = await asUser(app, ids.maria, ids.foodOrg, (tx) => tx<{ id: string }[]>`
      insert into cases (organization_id, case_type_id, household_id, status, assignee_id, summary)
      values (${ids.foodOrg}, ${caseType[0].id}, ${ids.henderson}, 'new', ${ids.maria}, 'Reopen check')
      returning id
    `);
    const caseId = created[0].id;
    try {
      await asUser(app, ids.maria, ids.foodOrg, (tx) => tx`update cases set status = 'closed' where id = ${caseId}`);
      await expect(
        asUser(app, ids.maria, ids.foodOrg, (tx) => tx`update cases set status = 'active' where id = ${caseId}`),
      ).rejects.toThrow(/reopen/i);
      await expect(
        asUser(app, ids.june, ids.foodOrg, (tx) => tx`update cases set status = 'active' where id = ${caseId}`),
      ).rejects.toThrow(/reason is required/i);
      await asUser(app, ids.june, ids.foodOrg, (tx) => tx`
        update cases set status = 'active', last_transition_reason = 'Reviewed with the household' where id = ${caseId}
      `);
      const reopened = await admin<{ status: string }[]>`select status from cases where id = ${caseId}`;
      expect(reopened[0].status).toBe("active");
    } finally {
      await admin`delete from activity_events where entity_id = ${caseId}`;
      await admin`delete from cases where id = ${caseId}`;
    }
  });

  it("rejects sensitive, unknown, and missing program answers", async () => {
    await expect(
      asUser(app, ids.maria, ids.foodOrg, (tx) => tx`
        insert into program_fields (organization_id, program_id, key, label, field_type)
        values (${ids.foodOrg}, ${ids.foodProgram}, 'ssn', 'SSN', 'short_text')
      `),
    ).rejects.toThrow(/sensitive field denied/i);
    await expect(
      asUser(app, ids.maria, ids.foodOrg, (tx) => tx`
        insert into enrollments (organization_id, household_id, program_id, field_values)
        values (${ids.foodOrg}, ${ids.henderson}, ${ids.foodProgram}, '{"nope":"1"}'::jsonb)
      `),
    ).rejects.toThrow(/unknown field/i);
    await expect(
      asUser(app, ids.maria, ids.foodOrg, (tx) => tx`
        insert into enrollments (organization_id, household_id, program_id, field_values)
        values (${ids.foodOrg}, ${ids.henderson}, ${ids.schoolProgram}, '{}'::jsonb)
      `),
    ).rejects.toThrow(/missing required field/i);
    await expect(
      asUser(app, ids.maria, ids.foodOrg, (tx) => tx`
        insert into programs (organization_id, name, description) values (${ids.foodOrg}, 'Another pantry', 'Extra')
      `),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(app, ids.june, ids.foodOrg, (tx) => tx`
        insert into programs (organization_id, name) values (${ids.foodOrg}, 'Food Assistance')
      `),
    ).rejects.toThrow(/duplicate key/i);
  });

  it("receives stock, then refuses a second issue that would pass zero", async () => {
    const itemId = randomUUID();
    const locationId = randomUUID();
    await admin`
      insert into items (id, organization_id, name, unit, low_stock_threshold)
      values (${itemId}, ${ids.foodOrg}, ${`Beans ${itemId.slice(0, 8)}`}, 'can', 1)
    `;
    await admin`
      insert into stock_locations (id, organization_id, name)
      values (${locationId}, ${ids.foodOrg}, ${`Bin ${itemId.slice(0, 8)}`})
    `;
    try {
      await asUser(app, ids.lee, ids.foodOrg, (tx) => tx`
        insert into stock_movements (organization_id, item_id, location_id, quantity, reason, actor_id)
        values (${ids.foodOrg}, ${itemId}, ${locationId}, 2, 'receive', ${ids.lee})
      `);
      await asUser(app, ids.maria, ids.foodOrg, (tx) => tx`
        insert into stock_movements (organization_id, item_id, location_id, quantity, reason, actor_id)
        values (${ids.foodOrg}, ${itemId}, ${locationId}, -1, 'issue', ${ids.maria})
      `);
      await asUser(app, ids.maria, ids.foodOrg, (tx) => tx`
        insert into stock_movements (organization_id, item_id, location_id, quantity, reason, actor_id)
        values (${ids.foodOrg}, ${itemId}, ${locationId}, -1, 'issue', ${ids.maria})
      `);
      const balance = await admin<{ quantity: string }[]>`
        select quantity::text from stock_balances where item_id = ${itemId}
      `;
      const notices = await admin<{ total: string }[]>`
        select count(*)::text as total from notifications where dedupe like ${"low:" + itemId + ":%"}
      `;
      expect(balance[0].quantity).toBe("0.00");
      expect(notices[0].total).toBe("1");
      await expect(
        asUser(app, ids.maria, ids.foodOrg, (tx) => tx`
          insert into stock_movements (organization_id, item_id, location_id, quantity, reason, actor_id)
          values (${ids.foodOrg}, ${itemId}, ${locationId}, -1, 'issue', ${ids.maria})
        `),
      ).rejects.toThrow(/insufficient stock/i);
    } finally {
      await admin`delete from notifications where dedupe like ${"low:" + itemId + ":%"}`;
      await admin`delete from stock_movements where item_id = ${itemId}`;
      await admin`delete from stock_balances where item_id = ${itemId}`;
      await admin`delete from stock_locations where id = ${locationId}`;
      await admin`delete from items where id = ${itemId}`;
    }
  });

  it("refuses to remove the signed-in person or the owner", async () => {
    await expect(
      asUser(app, ids.june, ids.foodOrg, (tx) => tx`select app.remove_member(${ids.june}::uuid)`),
    ).rejects.toThrow(/cannot remove yourself/i);
    await expect(
      asUser(app, ids.andre, ids.foodOrg, (tx) => tx`select app.remove_member(${ids.june}::uuid)`),
    ).rejects.toThrow(/transfer ownership/i);
  });

  it("removes a temporary member and leaves the owner in place", async () => {
    const userId = randomUUID();
    await admin`
      insert into users (id, email, name, password_hash)
      values (${userId}, ${`${userId}@example.test`}, 'Temp Member', 'scrypt$unused$unused')
    `;
    await admin`
      insert into memberships (organization_id, user_id, role)
      values (${ids.foodOrg}, ${userId}, 'viewer')
    `;
    try {
      await asUser(app, ids.june, ids.foodOrg, (tx) => tx`select app.remove_member(${userId}::uuid)`);
      const rows = await admin<{ status: string }[]>`
        select status from memberships where user_id = ${userId}
      `;
      expect(rows[0].status).toBe("removed");
      const owners = await admin<{ total: string }[]>`
        select count(*)::text as total from memberships
        where organization_id = ${ids.foodOrg} and role = 'owner' and status = 'active'
      `;
      expect(owners[0].total).toBe("1");
    } finally {
      await admin`delete from users where id = ${userId}`;
    }
  });
});

describe("search and offline sync", () => {
  it("searches only the rows the role can see", async () => {
    const worker = await searchAll(maria(), "Henderson");
    const viewer = await searchAll(orgContext({
      userId: ids.jordan,
      email: "jordan.hale@foodbank.test",
      name: "Jordan Hale",
      orgId: ids.foodOrg,
      orgName: "Community Food Bank",
      slug: "food-bank",
      role: "viewer",
    }), "Henderson");
    const coordinator = await searchAll(orgContext({
      userId: ids.pat,
      email: "pat.nguyen@foodbank.test",
      name: "Pat Nguyen",
      orgId: ids.foodOrg,
      orgName: "Community Food Bank",
      slug: "food-bank",
      role: "volunteer_coordinator",
    }), "Chris");
    const rural = await searchAll(orgContext({
      userId: ids.alex,
      email: "alex.morgan@rural.test",
      name: "Alex Morgan",
      orgId: ids.ruralOrg,
      orgName: "Rural Assistance NGO",
      slug: "rural-assistance",
      role: "case_worker",
    }), "Henderson");
    expect(worker.households.some((row) => String(row.label).includes("Henderson"))).toBe(true);
    expect(viewer.households).toHaveLength(0);
    expect(coordinator.volunteers.some((row) => String(row.name).includes("Chris"))).toBe(true);
    expect(worker.volunteers).toHaveLength(0);
    expect(rural.households).toHaveLength(0);
    expect(rural.cases).toHaveLength(0);
  });

  it("keeps a stale offline status from overwriting the case", async () => {
    const result = await applyOfflineMutation(maria(), {
      idempotencyKey: randomUUID(),
      kind: "case_status",
      payload: { caseId: ids.caseMaria, status: "waiting", baseStatus: "resolved" },
    });
    expect(result.status).toBe("conflict");
    const rows = await admin<{ status: string }[]>`select status from cases where id = ${ids.caseMaria}`;
    expect(rows[0].status).toBe("active");
  });

  it("records an offline stock conflict when the shelf is empty", async () => {
    const itemId = randomUUID();
    const locationId = randomUUID();
    const serviceId = randomUUID();
    await admin`
      insert into items (id, organization_id, name, unit)
      values (${itemId}, ${ids.foodOrg}, ${`Empty ${itemId.slice(0, 8)}`}, 'box')
    `;
    await admin`
      insert into stock_locations (id, organization_id, name)
      values (${locationId}, ${ids.foodOrg}, ${`Empty shelf ${itemId.slice(0, 8)}`})
    `;
    await admin`insert into stock_balances (item_id, location_id, quantity) values (${itemId}, ${locationId}, 0)`;
    await admin`
      insert into program_services (id, organization_id, program_id, name, tracks_inventory, item_id)
      values (${serviceId}, ${ids.foodOrg}, ${ids.foodProgram}, ${`Empty box ${itemId.slice(0, 8)}`}, true, ${itemId})
    `;
    try {
      const result = await applyOfflineMutation(maria(), {
        idempotencyKey: randomUUID(),
        kind: "assistance",
        payload: { caseId: ids.caseMaria, serviceId, quantity: 1, locationId },
      });
      expect(result.status).toBe("conflict");
      expect(JSON.stringify(result.result)).toMatch(/Not enough stock/i);
      const lines = await admin<{ total: string }[]>`
        select count(*)::text as total from assistance_lines where program_service_id = ${serviceId}
      `;
      expect(lines[0].total).toBe("0");
    } finally {
      await admin`delete from client_mutations where payload::text like ${"%" + serviceId + "%"}`;
      await admin`delete from program_services where id = ${serviceId}`;
      await admin`delete from stock_balances where item_id = ${itemId}`;
      await admin`delete from stock_locations where id = ${locationId}`;
      await admin`delete from items where id = ${itemId}`;
    }
  });
});
