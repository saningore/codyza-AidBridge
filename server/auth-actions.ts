"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendMail, mailConfigured } from "@/lib/mail";
import { newMfaSecret, verifyTotp } from "@/lib/totp";
import { newSecretToken, sha256 } from "@/lib/tokens";
import { slugify, dbMessage } from "@/lib/format";
import { sql, withUser } from "@/server/db";
import {
  clearChallengeCookie,
  clearSessionCookie,
  currentSessionToken,
  getSession,
  listMyOrgs,
  readChallengeCookie,
  requireOrg,
  requireUser,
  setChallengeCookie,
  setSessionCookie,
} from "@/server/context";
import type { FormState } from "@/server/forms";

async function destination(userId: string) {
  const orgs = await listMyOrgs(userId);
  if (orgs.length === 1) return `/o/${orgs[0].slug}`;
  if (orgs.length === 0) return "/start";
  return "/orgs";
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const attempts = await sql<{ note_login_attempt: number }[]>`select app.note_login_attempt(${email}) as note_login_attempt`;
  if (Number(attempts[0]?.note_login_attempt) > 8) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  const rows = await sql<{ id: string; password_hash: string; mfa_enabled: boolean; name: string }[]>`
    select id, password_hash, mfa_enabled, name from app.lookup_login(${email})
  `;
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Email or password is incorrect." };
  }
  await sql`select app.clear_login_attempts(${email})`;
  if (user.mfa_enabled) {
    const token = newSecretToken();
    await sql`select app.open_challenge(${user.id}, ${token.hash})`;
    await setChallengeCookie(token.raw);
    return { error: "", step: "totp" };
  }
  const membership = await sql<{ role: string; mfa_enabled: boolean }[]>`
    select m.role, u.mfa_enabled
    from memberships m
    join users u on u.id = m.user_id
    where m.user_id = ${user.id} and m.status = 'active'
  `;
  const needsEnroll = membership.some((row) => (row.role === "owner" || row.role === "administrator") && !user.mfa_enabled);
  const token = newSecretToken();
  await sql`select app.open_session(${user.id}, ${token.hash}, ${needsEnroll ? "enroll" : "full"}, now() + interval '14 days')`;
  await setSessionCookie(token.raw);
  redirect(needsEnroll ? "/mfa" : await destination(user.id));
}

export async function confirmLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim();
  const raw = await readChallengeCookie();
  if (!raw) return { error: "That sign-in expired. Start again.", step: "password" };
  const rows = await sql<{ user_id: string; mfa_secret: string | null; mfa_enabled: boolean }[]>`
    select * from app.take_challenge(${sha256(raw)})
  `;
  const challenge = rows[0];
  await clearChallengeCookie();
  if (!challenge?.mfa_secret || !verifyTotp(challenge.mfa_secret, code)) {
    return { error: "That code is not valid. Sign in again.", step: "password" };
  }
  const token = newSecretToken();
  await sql`select app.open_session(${challenge.user_id}, ${token.hash}, 'full', now() + interval '14 days')`;
  await setSessionCookie(token.raw);
  redirect(await destination(challenge.user_id));
}

export async function logout() {
  const raw = await currentSessionToken();
  if (raw) await sql`select app.revoke_session(${sha256(raw)})`;
  await clearSessionCookie();
  redirect("/login");
}

export async function startOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const person = String(formData.get("person") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const timezone = String(formData.get("timezone") ?? "America/Chicago");
  if (person.length < 2 || name.length < 2) return { error: "Enter your name and the organization name." };
  if (!email.includes("@")) return { error: "Enter a real email address." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };
  const passwordHash = await hashPassword(password);
  let slug = slugify(name);
  try {
    const created = await sql<{ user_id: string; organization_id: string }[]>`
      select * from app.register_owner(${email}, ${person}, ${passwordHash}, ${name}, ${slug}, ${timezone})
    `;
    const token = newSecretToken();
    await sql`select app.open_session(${created[0].user_id}, ${token.hash}, 'enroll', now() + interval '14 days')`;
    await setSessionCookie(token.raw);
  } catch (error) {
    if (error instanceof Error && /organizations_slug_key|duplicate/i.test(error.message)) {
      slug = `${slugify(name)}-${Math.floor(Math.random() * 900 + 100)}`;
      try {
        const created = await sql<{ user_id: string }[]>`
          select * from app.register_owner(${email}, ${person}, ${passwordHash}, ${name}, ${slug}, ${timezone})
        `;
        const token = newSecretToken();
        await sql`select app.open_session(${created[0].user_id}, ${token.hash}, 'enroll', now() + interval '14 days')`;
        await setSessionCookie(token.raw);
      } catch (retry) {
        return { error: dbMessage(retry) };
      }
    } else {
      return { error: dbMessage(error) };
    }
  }
  redirect("/mfa");
}

export async function beginMfa(): Promise<FormState> {
  const session = await requireUser();
  const secret = newMfaSecret();
  try {
    await withUser(session.userId, (tx) => tx`select app.begin_mfa(${secret})`);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  return { error: "", notice: secret };
}

export async function confirmMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const code = String(formData.get("code") ?? "");
  const secret = await withUser(session.userId, async (tx) => {
    const rows = await tx<{ my_mfa_secret: string | null }[]>`select app.my_mfa_secret() as my_mfa_secret`;
    return rows[0]?.my_mfa_secret ?? null;
  });
  if (!secret || !verifyTotp(secret, code)) return { error: "That code does not match the authenticator secret." };
  const raw = await currentSessionToken();
  await withUser(session.userId, async (tx) => {
    await tx`select app.confirm_mfa()`;
    if (raw) await tx`select app.promote_session(${sha256(raw)})`;
  });
  redirect(await destination(session.userId));
}

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const hash = sha256(token);
  const peek = await sql<{ email: string; expired: boolean }[]>`select email::text, expired from app.peek_invite(${hash})`;
  const invite = peek[0];
  if (!invite || invite.expired) return { error: "This invite is invalid or expired." };
  const existing = await sql<{ id: string; password_hash: string }[]>`
    select id, password_hash from app.lookup_login(${invite.email})
  `;
  try {
    let userId: string;
    if (existing[0]) {
      if (!(await verifyPassword(password, existing[0].password_hash))) {
        return { error: "That email already has an account. Enter its current password to join." };
      }
      const rows = await sql<{ accept_invite_existing: string }[]>`
        select app.accept_invite_existing(${hash}, ${existing[0].id}) as accept_invite_existing
      `;
      userId = rows[0].accept_invite_existing;
    } else {
      if (name.length < 2) return { error: "Enter your name." };
      if (password.length < 10) return { error: "Use a password of at least 10 characters." };
      const rows = await sql<{ accept_invite_new: string }[]>`
        select app.accept_invite_new(${hash}, ${name}, ${await hashPassword(password)}) as accept_invite_new
      `;
      userId = rows[0].accept_invite_new;
    }
    const session = newSecretToken();
    const roles = await sql<{ role: string; mfa_enabled: boolean }[]>`
      select m.role, u.mfa_enabled from memberships m join users u on u.id = m.user_id
      where m.user_id = ${userId} and m.status = 'active'
    `;
    const enroll = roles.some((row) => (row.role === "owner" || row.role === "administrator") && !row.mfa_enabled);
    await sql`select app.open_session(${userId}, ${session.hash}, ${enroll ? "enroll" : "full"}, now() + interval '14 days')`;
    await setSessionCookie(session.raw);
    redirect(enroll ? "/mfa" : await destination(userId));
  } catch (error) {
    return { error: dbMessage(error) };
  }
}

export async function sendInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg(String(formData.get("slug") ?? ""));
  if (!ctx.can("member.invite")) return { error: "You cannot invite people." };
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!email.includes("@")) return { error: "Enter an email address." };
  if (role === "owner" && ctx.role !== "owner") return { error: "Only the owner can invite another owner." };
  const token = newSecretToken();
  try {
    const { inviteMember } = await import("@/server/data");
    await inviteMember(ctx, { email, role, tokenHash: token.hash });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  const hostHeader = await headers();
  const host = hostHeader.get("x-forwarded-host") ?? hostHeader.get("host") ?? "localhost:3000";
  const proto = hostHeader.get("x-forwarded-proto") ?? "http";
  const link = `${proto}://${host}/invite/${token.raw}`;
  let sent = false;
  if (mailConfigured()) {
    try {
      await sendMail(email, `Join ${ctx.orgName} on AidBridge`, `You were invited as ${role}.\n\n${link}\n\nThis link expires in 7 days.`);
      sent = true;
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "mail failed" }));
    }
  }
  return {
    error: "",
    notice: sent ? "Invite emailed. The link is also here if the message does not arrive." : "Email is not configured. Copy this invite link.",
    link,
  };
}

export async function sessionUser() {
  return getSession();
}
