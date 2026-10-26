import { ActionForm } from "@/components/action-form";
import { acceptInvite } from "@/server/auth-actions";
import { sql } from "@/server/db";
import { sha256 } from "@/lib/tokens";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = await sql<{ email: string; role: string; organization_name: string; expired: boolean }[]>`
    select email::text, role, organization_name, expired from app.peek_invite(${sha256(token)})
  `;
  const invite = rows[0];
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <h1 className="font-serif text-4xl">Join an organization</h1>
      {!invite || invite.expired ? (
        <p className="card">This invite is invalid or expired.</p>
      ) : (
        <div className="card grid gap-4">
          <p>{invite.organization_name} invited <strong>{invite.email}</strong> as {invite.role.replaceAll("_", " ")}.</p>
          <ActionForm action={acceptInvite} submitLabel="Accept invite">
            <input type="hidden" name="token" value={token} />
            <label className="field">Your name<input name="name" /></label>
            <label className="field">Password<input name="password" type="password" required /></label>
          </ActionForm>
        </div>
      )}
    </main>
  );
}
