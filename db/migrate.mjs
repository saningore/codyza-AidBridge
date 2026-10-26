import { readFileSync } from "node:fs";
import postgres from "postgres";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {
    // The process environment is enough when .env is absent.
  }
}

loadEnv();

const adminUrl = process.env.DATABASE_URL_ADMIN;
if (!adminUrl) {
  console.error("DATABASE_URL_ADMIN is required");
  process.exit(1);
}

const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
const reset = process.argv.includes("--reset");

try {
  if (reset) {
    await sql.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists app cascade;
      create schema public;
      grant all on schema public to public;
    `);
  }

  const existing = await sql`select to_regclass('public.organizations') as name`;
  if (existing[0]?.name && !reset) {
    console.log("Schema already present. Use --reset to rebuild it.");
  } else {
    const roles = await sql`select 1 from pg_roles where rolname = 'aidbridge_app'`;
    if (roles.length === 0) {
      await sql.unsafe(
        "create role aidbridge_app login password 'aidbridge_app' nosuperuser nobypassrls nocreatedb",
      );
    }
    const file = readFileSync(new URL("./migrations/001_schema.sql", import.meta.url), "utf8");
    await sql.unsafe(file);
    console.log("Migration applied.");
  }
} finally {
  await sql.end();
}
