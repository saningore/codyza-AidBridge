import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { ids } from "../../db/ids";
import { applyOfflineMutation } from "../../server/data";

const app = postgres(process.env.DATABASE_URL!, { max: 4 });
const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 });

async function asUser<T>(userId: string, orgId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return app.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("organization isolation", () => {
  it("returns no rows from another organization and none when the tenant is unset", async () => {
    const foreign = await asUser(ids.alex, ids.ruralOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from households where organization_id = ${ids.foodOrg}
    `);
    expect(foreign[0].total).toBe("0");

    const unset = await app.begin(async (tx) => {
      await tx`select set_config('app.user_id', '', true)`;
      await tx`select set_config('app.org_id', '', true)`;
      return tx<{ total: string }[]>`select count(*)::text as total from households`;
    });
    expect(unset[0].total).toBe("0");
  });
});

describe("column redaction", () => {
  it("shows a viewer the household code and hides the name and phone", async () => {
    const rows = await asUser(ids.jordan, ids.foodOrg, (tx) => tx<{ label: string; phone: string | null }[]>`
      select label, phone from v_households where code = 'H-1042'
    `);
    expect(rows[0].label).toBe("Household H-1042");
    expect(rows[0].phone).toBeNull();
  });

  it("shows a case worker the household name and phone", async () => {
    const rows = await asUser(ids.maria, ids.foodOrg, (tx) => tx<{ label: string; phone: string | null }[]>`
      select label, phone from v_households where code = 'H-1042'
    `);
    expect(rows[0].label).toBe("Henderson household");
    expect(rows[0].phone).toBe("217-555-0148");
  });
});

describe("assignment scope", () => {
  it("shows a field worker the assigned household and hides the unassigned one", async () => {
    const rows = await asUser(ids.sam, ids.foodOrg, (tx) => tx<{ label: string }[]>`
      select label from households order by code
    `);
    expect(rows.map((row) => row.label)).toEqual(["Henderson household"]);
  });

  it("hides case notes and private tasks from a volunteer coordinator", async () => {
    const notes = await asUser(ids.pat, ids.foodOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from case_notes
    `);
    const tasks = await asUser(ids.pat, ids.foodOrg, (tx) => tx<{ title: string }[]>`
      select title from tasks order by title
    `);
    expect(notes[0].total).toBe("0");
    expect(tasks.map((row) => row.title)).toEqual(["Thursday pantry delivery"]);
  });
});

describe("case and stock rules", () => {
  it("rejects an illegal status change", async () => {
    await expect(
      asUser(ids.maria, ids.foodOrg, (tx) => tx`
        update cases set status = 'new' where id = ${ids.caseMaria}
      `),
    ).rejects.toThrow(/invalid status transition/i);
  });

  it("lets only one of two concurrent issues take the last unit", async () => {
    const itemId = randomUUID();
    const locationId = randomUUID();
    await admin`
      insert into items (id, organization_id, name, unit) values (${itemId}, ${ids.foodOrg}, ${`Last unit ${itemId.slice(0, 8)}`}, 'box')
    `;
    await admin`
      insert into stock_locations (id, organization_id, name) values (${locationId}, ${ids.foodOrg}, ${`Shelf ${itemId.slice(0, 8)}`})
    `;
    await admin`insert into stock_balances (item_id, location_id, quantity) values (${itemId}, ${locationId}, 1)`;

    const issue = () =>
      asUser(ids.maria, ids.foodOrg, (tx) => tx`
        insert into stock_movements (organization_id, item_id, location_id, quantity, reason, actor_id)
        values (${ids.foodOrg}, ${itemId}, ${locationId}, -1, 'issue', ${ids.maria})
      `);

    const results = await Promise.allSettled([issue(), issue()]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/insufficient stock/i);

    await admin`delete from stock_movements where item_id = ${itemId}`;
    await admin`delete from stock_balances where item_id = ${itemId}`;
    await admin`delete from stock_locations where id = ${locationId}`;
    await admin`delete from items where id = ${itemId}`;
  });
});

describe("offline idempotency", () => {
  it("records one note when the same key is sent twice", async () => {
    const key = randomUUID();
    const body = `Offline note ${key}`;
    const ctx = {
      userId: ids.maria,
      email: "maria.santos@foodbank.test",
      name: "Maria Santos",
      orgId: ids.foodOrg,
      orgName: "Community Food Bank",
      slug: "food-bank",
      role: "case_worker",
      timezone: "America/Chicago",
      demo: true,
      purgeAfter: null,
      householdPrefix: "H",
      casePrefix: "AC",
      permissions: ["case.write"],
      can: () => true,
    };
    await applyOfflineMutation(ctx, { idempotencyKey: key, kind: "case_note", payload: { caseId: ids.caseMaria, body } });
    await applyOfflineMutation(ctx, { idempotencyKey: key, kind: "case_note", payload: { caseId: ids.caseMaria, body } });
    const rows = await asUser(ids.maria, ids.foodOrg, (tx) => tx<{ total: string }[]>`
      select count(*)::text as total from case_notes where body = ${body}
    `);
    expect(rows[0].total).toBe("1");
  });
});
