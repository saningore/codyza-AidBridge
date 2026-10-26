import type postgres from "postgres";
import type { OrgContext } from "../../server/context";

export async function asUser<T>(
  app: postgres.Sql,
  userId: string,
  orgId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
) {
  return app.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}

export function orgContext(input: {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  slug: string;
  role: string;
}): OrgContext {
  return {
    ...input,
    timezone: "America/Chicago",
    demo: true,
    purgeAfter: null,
    householdPrefix: "H",
    casePrefix: "AC",
    permissions: [],
    can: () => true,
  };
}
