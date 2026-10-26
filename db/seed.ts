import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { hashPassword } from "../lib/password";
import { demoMfa, demoPassword, ids } from "./ids";

function loadEnv() {
  const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

loadEnv();

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 });

async function main() {
const passwordHash = await hashPassword(demoPassword);
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF\n");

const caseTypeFood = "dddddddd-dddd-4ddd-8ddd-dddddddddd21";
const caseTypeRural = "dddddddd-dddd-4ddd-8ddd-dddddddddd22";
const docId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const volunteerId = "ffffffff-ffff-4fff-8fff-fffffffffff2";
const schoolField = "dddddddd-dddd-4ddd-8ddd-dddddddddd31";

try {
  await sql`delete from organizations where slug in ('food-bank', 'rural-assistance')`;
  await sql`
    delete from users where email in (
      'june.alvarez@foodbank.test', 'andre.brooks@foodbank.test', 'maria.santos@foodbank.test',
      'sam.okonkwo@foodbank.test', 'pat.nguyen@foodbank.test', 'lee.ortiz@foodbank.test',
      'jordan.hale@foodbank.test', 'riley.chen@rural.test', 'alex.morgan@rural.test'
    )
  `;

  await sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${ids.maria}, true)`;
    await tx`select set_config('app.org_id', ${ids.foodOrg}, true)`;

    const people = [
      [ids.june, "june.alvarez@foodbank.test", "June Alvarez", demoMfa.june, true],
      [ids.andre, "andre.brooks@foodbank.test", "Andre Brooks", demoMfa.andre, true],
      [ids.maria, "maria.santos@foodbank.test", "Maria Santos", null, false],
      [ids.sam, "sam.okonkwo@foodbank.test", "Sam Okonkwo", null, false],
      [ids.pat, "pat.nguyen@foodbank.test", "Pat Nguyen", null, false],
      [ids.lee, "lee.ortiz@foodbank.test", "Lee Ortiz", null, false],
      [ids.jordan, "jordan.hale@foodbank.test", "Jordan Hale", null, false],
      [ids.riley, "riley.chen@rural.test", "Riley Chen", demoMfa.riley, true],
      [ids.alex, "alex.morgan@rural.test", "Alex Morgan", null, false],
    ] as const;
    for (const [id, email, name, secret, mfa] of people) {
      await tx`
        insert into users (id, email, name, password_hash, mfa_secret, mfa_enabled)
        values (${id}, ${email}, ${name}, ${passwordHash}, ${secret}, ${mfa})
      `;
    }

    await tx`
      insert into organizations (id, name, slug, timezone, demo, household_prefix, case_prefix)
      values
        (${ids.foodOrg}, 'Community Food Bank', 'food-bank', 'America/Chicago', true, 'H', 'AC'),
        (${ids.ruralOrg}, 'Rural Assistance NGO', 'rural-assistance', 'America/Chicago', true, 'H', 'AC')
    `;

    const members = [
      [ids.foodOrg, ids.june, "owner"],
      [ids.foodOrg, ids.andre, "administrator"],
      [ids.foodOrg, ids.maria, "case_worker"],
      [ids.foodOrg, ids.sam, "field_worker"],
      [ids.foodOrg, ids.pat, "volunteer_coordinator"],
      [ids.foodOrg, ids.lee, "inventory_manager"],
      [ids.foodOrg, ids.jordan, "viewer"],
      [ids.ruralOrg, ids.riley, "owner"],
      [ids.ruralOrg, ids.alex, "case_worker"],
    ] as const;
    for (const [org, user, role] of members) {
      await tx`insert into memberships (organization_id, user_id, role) values (${org}, ${user}, ${role})`;
    }

    await tx`
      insert into counters (organization_id, kind, value) values
        (${ids.foodOrg}, 'household', 1043),
        (${ids.foodOrg}, 'case', 2042),
        (${ids.ruralOrg}, 'household', 1042),
        (${ids.ruralOrg}, 'case', 2041)
    `;

    await tx`
      insert into programs (id, organization_id, name, description, eligibility) values
        (${ids.foodProgram}, ${ids.foodOrg}, 'Food Assistance', 'Weekly food for households in the service area.', 'Lives in the service area and asks for food help.'),
        (${ids.schoolProgram}, ${ids.foodOrg}, 'School Supply Program', 'Backpacks and supplies at the start of term.', 'Household has a child enrolled in school.')
    `;
    await tx`
      insert into program_fields (id, organization_id, program_id, key, label, field_type, required, options) values
        (${schoolField}, ${ids.foodOrg}, ${ids.schoolProgram}, 'children_count', 'Children receiving supplies', 'number', true, '[]'::jsonb)
    `;
    await tx`
      insert into items (id, organization_id, name, unit, low_stock_threshold) values
        (${ids.foodBox}, ${ids.foodOrg}, 'Food box', 'box', 4),
        (${ids.rice}, ${ids.foodOrg}, 'Rice 10 lb', 'bag', 6)
    `;
    await tx`insert into stock_locations (id, organization_id, name) values (${ids.pantry}, ${ids.foodOrg}, 'Main pantry')`;
    await tx`
      insert into stock_balances (item_id, location_id, quantity) values
        (${ids.foodBox}, ${ids.pantry}, 12),
        (${ids.rice}, ${ids.pantry}, 2)
    `;
    await tx`
      insert into program_services (id, organization_id, program_id, name, unit, tracks_inventory, item_id) values
        (${ids.foodService}, ${ids.foodOrg}, ${ids.foodProgram}, 'Food box', 'box', true, ${ids.foodBox})
    `;
    await tx`
      insert into case_types (id, organization_id, name, program_id) values
        (${caseTypeFood}, ${ids.foodOrg}, 'Food Assistance', ${ids.foodProgram}),
        (${caseTypeRural}, ${ids.ruralOrg}, 'General', null)
    `;

    await tx`
      insert into households (
        id, organization_id, code, label, location_label, location_precision, phone, email,
        geocode_status, assigned_worker_id, consent_at, consent_by, geom
      ) values (
        ${ids.henderson}, ${ids.foodOrg}, 'H-1042', 'Henderson household', 'Eastside, Springfield', 'neighborhood',
        '217-555-0148', 'dana.henderson@example.net', 'manual', ${ids.sam}, now(), ${ids.maria},
        ST_SetSRID(ST_MakePoint(-89.62, 39.79), 4326)::geography
      )
    `;
    await tx`
      insert into households (
        id, organization_id, code, label, location_label, location_precision, geocode_status, consent_at, consent_by
      ) values (
        ${ids.brooks}, ${ids.foodOrg}, 'H-1043', 'Ellis household', 'West end, Springfield', 'zip', 'unavailable', now(), ${ids.maria}
      )
    `;
    await tx`
      insert into people (id, organization_id, household_id, preferred_name, relationship, age_band, phone, email, is_primary) values
        (${ids.dana}, ${ids.foodOrg}, ${ids.henderson}, 'Dana Henderson', 'self', 'adult', '217-555-0148', 'dana.henderson@example.net', true)
    `;
    await tx`
      insert into people (organization_id, household_id, preferred_name, relationship, age_band, is_primary) values
        (${ids.foodOrg}, ${ids.henderson}, 'Moss Henderson', 'child', 'child', false)
    `;

    await tx`
      insert into enrollments (organization_id, household_id, program_id, field_values) values
        (${ids.foodOrg}, ${ids.henderson}, ${ids.foodProgram}, '{}'::jsonb),
        (${ids.foodOrg}, ${ids.brooks}, ${ids.schoolProgram}, '{"children_count":"2"}'::jsonb)
    `;

    await tx`
      insert into cases (id, organization_id, code, case_type_id, household_id, status, priority, assignee_id, summary) values
        (${ids.caseMaria}, ${ids.foodOrg}, 'AC-2041', ${caseTypeFood}, ${ids.henderson}, 'active', 'high', ${ids.maria}, 'Food assistance'),
        (${ids.caseSam}, ${ids.foodOrg}, 'AC-2042', ${caseTypeFood}, ${ids.henderson}, 'active', 'normal', ${ids.sam}, 'Pantry delivery')
    `;
    await tx`
      insert into case_notes (id, organization_id, case_id, author_id, body) values (
        ${ids.note}, ${ids.foodOrg}, ${ids.caseMaria}, ${ids.maria},
        'Dana called about a delivery window on Thursday afternoon. Leave the box with the neighbor if nobody is home.'
      )
    `;
    await tx`
      insert into tasks (id, organization_id, case_id, title, due_on, volunteer_visible) values
        (${ids.taskPrivate}, ${ids.foodOrg}, ${ids.caseMaria}, 'Call about the Thursday window', current_date + 1, false)
    `;
    await tx`
      insert into tasks (id, organization_id, case_id, title, due_on, volunteer_visible, area_label, household_label) values
        (${ids.taskVisible}, ${ids.foodOrg}, ${ids.caseSam}, 'Thursday pantry delivery', current_date + 1, true, 'Eastside', 'Henderson household')
    `;
    await tx`
      insert into appointments (organization_id, case_id, starts_at, place_label) values
        (${ids.foodOrg}, ${ids.caseMaria}, now() + interval '20 hours', 'Main pantry desk')
    `;
    await tx`
      insert into assistance_lines (
        organization_id, case_id, program_service_id, quantity, item_id, location_id, household_code, actor_id
      ) values (
        ${ids.foodOrg}, ${ids.caseMaria}, ${ids.foodService}, 1, ${ids.foodBox}, ${ids.pantry}, 'H-1042', ${ids.maria}
      )
    `;
    const assistance = await tx<{ id: string }[]>`select id from assistance_lines where case_id = ${ids.caseMaria} limit 1`;
    await tx`
      insert into stock_movements (organization_id, item_id, location_id, quantity, reason, assistance_id, actor_id, note)
      values (${ids.foodOrg}, ${ids.foodBox}, ${ids.pantry}, -1, 'issue', ${assistance[0].id}, ${ids.maria}, 'Opening balance issue')
    `;

    await tx`
      insert into volunteers (id, organization_id, name, phone, skills) values
        (${volunteerId}, ${ids.foodOrg}, 'Chris Patel', '217-555-0199', 'Driving, Spanish')
    `;
    await tx`
      insert into shifts (organization_id, volunteer_id, starts_at, ends_at, role_label) values
        (${ids.foodOrg}, ${volunteerId}, now() + interval '1 day', now() + interval '1 day 3 hours', 'Pantry')
    `;
    await tx`
      insert into volunteer_hours (organization_id, volunteer_id, hours, note) values
        (${ids.foodOrg}, ${volunteerId}, 3, 'Sorted produce')
    `;
    await tx`
      insert into service_sites (
        id, organization_id, name, category, eligibility, hours_label, phone, area_label, street_address,
        geom, geocode_status, last_verified_on
      ) values (
        ${ids.clinic}, ${ids.foodOrg}, 'Harbor Clinic', 'Health', 'Call ahead for a same-week visit.',
        'Weekdays 9 to 4', '217-555-0170', 'Downtown Springfield', '100 Health Ave, Springfield, IL',
        ST_SetSRID(ST_MakePoint(-89.65, 39.80), 4326)::geography, 'manual', current_date
      )
    `;
    await tx`
      insert into referrals (organization_id, case_id, kind, service_site_id, packet_need, packet_contact, status, created_by)
      values (
        ${ids.foodOrg}, ${ids.caseMaria}, 'directory', ${ids.clinic},
        'Needs a weekday clinic visit.', '217-555-0148', 'sent', ${ids.maria}
      )
    `;
    await tx`
      insert into notifications (organization_id, user_id, kind, title, body) values
        (${ids.foodOrg}, ${ids.maria}, 'case_assigned', 'Case assigned', 'AC-2041 is on your list.'),
        (${ids.foodOrg}, ${ids.lee}, 'low_stock', 'Low stock', 'Rice 10 lb is at 2 bag.')
    `;
    await tx`
      insert into documents (id, organization_id, case_id, storage_key, filename, mime, size_bytes, uploaded_by)
      values (
        ${docId}, ${ids.foodOrg}, ${ids.caseMaria}, ${`${ids.foodOrg}/${docId}`},
        'consent-note.pdf', 'application/pdf', ${pdf.length}, ${ids.maria}
      )
    `;

    await tx`select set_config('app.user_id', ${ids.alex}, true)`;
    await tx`select set_config('app.org_id', ${ids.ruralOrg}, true)`;
    await tx`
      insert into households (
        id, organization_id, code, label, location_label, location_precision, geocode_status, consent_at, consent_by
      ) values (
        ${ids.carter}, ${ids.ruralOrg}, 'H-1042', 'Carter household', 'County road 12', 'neighborhood', 'unavailable', now(), ${ids.alex}
      )
    `;
    await tx`
      insert into people (organization_id, household_id, preferred_name, relationship, is_primary) values
        (${ids.ruralOrg}, ${ids.carter}, 'Avery Carter', 'self', true)
    `;
    await tx`
      insert into cases (id, organization_id, code, case_type_id, household_id, status, priority, assignee_id, summary) values
        (${ids.caseCarter}, ${ids.ruralOrg}, 'AC-2041', ${caseTypeRural}, ${ids.carter}, 'new', 'normal', ${ids.alex}, 'Transportation')
    `;
  });

  const folder = path.join(process.cwd(), "storage", ids.foodOrg);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, docId), pdf);
  console.log("Seeded Community Food Bank and Rural Assistance NGO.");
  console.log(`Demo password: ${demoPassword}`);
} catch (error) {
  throw error;
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await sql.end();
});

