import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { confirmMfa, beginMfa } from "@/server/auth-actions";
import { requireUser } from "@/server/context";
import { withUser } from "@/server/db";

export default async function MfaPage() {
  const session = await requireUser();
  if (session.mfaEnabled && session.scope === "full") redirect("/");
  const rows = await withUser(session.userId, (tx) => tx<{ secret: string | null }[]>`select app.my_mfa_secret() as secret`);
  const secret = rows[0]?.secret;
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <div>
        <h1 className="font-serif text-4xl">Authenticator app</h1>
        <p className="mt-2 text-ink/75">Owners and administrators enter a code from an authenticator app before they can open records.</p>
      </div>
      {secret ? (
        <div className="card grid gap-4">
          <p>Add this secret to your authenticator app, then enter the current code.</p>
          <p className="break-all rounded-xl bg-mist p-3 font-bold tracking-widest">{secret}</p>
          <ActionForm action={confirmMfa} submitLabel="Turn on codes">
            <label className="field">Current code<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
          </ActionForm>
        </div>
      ) : (
        <form action={async () => { "use server"; await beginMfa(); redirect("/mfa"); }}>
          <button className="btn">Create a secret</button>
        </form>
      )}
    </main>
  );
}
