import postgres from "postgres";

const globalForSql = globalThis as unknown as { aidbridge?: postgres.Sql };

export const sql =
  globalForSql.aidbridge ??
  postgres(process.env.DATABASE_URL!, {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForSql.aidbridge = sql;

export type Tx = postgres.TransactionSql<Record<string, never>>;

export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.org_id', '', true)`;
    return fn(tx);
  });
}

export async function withOrg<T>(userId: string, orgId: string, fn: (tx: Tx) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}
