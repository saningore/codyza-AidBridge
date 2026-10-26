import { readFileSync } from "node:fs";
import postgres from "postgres";

function loadEnv() {
  const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

loadEnv();
const started = Date.now();
let lastError = "database did not answer";

while (Date.now() - started < 90_000) {
  const sql = postgres(process.env.DATABASE_URL_ADMIN, { max: 1, connect_timeout: 3 });
  try {
    await sql`select 1 as ok`;
    await sql.end();
    console.log("Database is ready.");
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await sql.end({ timeout: 1 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

console.error(lastError);
process.exit(1);
