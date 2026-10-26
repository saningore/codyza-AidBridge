import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sha256 } from "@/lib/tokens";
import { sql, withUser } from "@/server/db";

export type Session = {
  userId: string;
  email: string;
  name: string;
  scope: "full" | "enroll";
  mfaEnabled: boolean;
};

export type OrgContext = {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  slug: string;
  role: string;
  timezone: string;
  demo: boolean;
  purgeAfter: string | null;
  householdPrefix: string;
  casePrefix: string;
  permissions: string[];
  can: (permission: string) => boolean;
};

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function setSessionCookie(raw: string) {
  const jar = await cookies();
  jar.set("ab_session", raw, { ...cookieBase, maxAge: 60 * 60 * 24 * 14 });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete("ab_session");
}

export async function setChallengeCookie(raw: string) {
  const jar = await cookies();
  jar.set("ab_challenge", raw, { ...cookieBase, maxAge: 60 * 5 });
}

export async function readChallengeCookie() {
  const jar = await cookies();
  return jar.get("ab_challenge")?.value ?? null;
}

export async function clearChallengeCookie() {
  const jar = await cookies();
  jar.delete("ab_challenge");
}

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const raw = jar.get("ab_session")?.value;
  if (!raw) return null;
  const rows = await sql<{ user_id: string; email: string; name: string; scope: "full" | "enroll"; mfa_enabled: boolean }[]>`
    select * from app.read_session(${sha256(raw)})
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    scope: row.scope,
    mfaEnabled: row.mfa_enabled,
  };
});

export async function currentSessionToken() {
  const jar = await cookies();
  return jar.get("ab_session")?.value ?? null;
}

export const requireUser = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

export const requireOrg = cache(async (slug: string): Promise<OrgContext> => {
  const loaded = await loadOrg(slug);
  if (loaded === "login") redirect("/login");
  if (loaded === "mfa") redirect("/mfa");
  if (!loaded) notFound();
  return loaded;
});

export async function loadOrg(slug: string): Promise<OrgContext | "login" | "mfa" | null> {
  const session = await getSession();
  if (!session) return "login";
  if (session.scope !== "full") return "mfa";
  const loaded = await withUser(session.userId, async (tx) => {
    const orgs = await tx<
      {
        id: string;
        name: string;
        slug: string;
        timezone: string;
        demo: boolean;
        purge_after: Date | null;
        role: string;
        household_prefix: string;
        case_prefix: string;
      }[]
    >`
      select o.id, o.name, o.slug, o.timezone, o.demo, o.purge_after, o.household_prefix, o.case_prefix, m.role
      from memberships m
      join organizations o on o.id = m.organization_id
      where m.user_id = ${session.userId} and m.status = 'active' and o.slug = ${slug}
    `;
    const org = orgs[0];
    if (!org) return null;
    const perms = await tx<{ permission: string }[]>`
      select permission from role_permissions where role = ${org.role} order by permission
    `;
    return { org, permissions: perms.map((row) => row.permission) };
  });
  if (!loaded) return null;
  if ((loaded.org.role === "owner" || loaded.org.role === "administrator") && !session.mfaEnabled) return "mfa";
  const permissions = loaded.permissions;
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    orgId: loaded.org.id,
    orgName: loaded.org.name,
    slug: loaded.org.slug,
    role: loaded.org.role,
    timezone: loaded.org.timezone,
    demo: loaded.org.demo,
    purgeAfter: loaded.org.purge_after ? loaded.org.purge_after.toISOString() : null,
    householdPrefix: loaded.org.household_prefix,
    casePrefix: loaded.org.case_prefix,
    permissions,
    can: (permission: string) => permissions.includes(permission),
  };
}

export async function listMyOrgs(userId: string) {
  return withUser(userId, (tx) => tx<{ id: string; name: string; slug: string; role: string }[]>`
    select o.id, o.name, o.slug, m.role
    from memberships m
    join organizations o on o.id = m.organization_id
    where m.user_id = ${userId} and m.status = 'active'
    order by o.name
  `);
}
