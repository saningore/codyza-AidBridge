import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { startOrganization } from "@/server/auth-actions";

export default function StartPage() {
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">Create an organization</h1>
        <p className="mt-2 text-ink/75">You become the owner. Owners turn on an authenticator app before opening records.</p>
      </div>
      <div className="card">
        <ActionForm action={startOrganization} submitLabel="Create organization">
          <label className="field">Your name<input name="person" required /></label>
          <label className="field">Email<input name="email" type="email" required /></label>
          <label className="field">Password<input name="password" type="password" minLength={10} required /></label>
          <label className="field">Organization name<input name="name" required /></label>
          <label className="field">Timezone
            <select name="timezone" defaultValue="America/Chicago">
              <option>America/Chicago</option>
              <option>America/New_York</option>
              <option>America/Denver</option>
              <option>America/Los_Angeles</option>
            </select>
          </label>
        </ActionForm>
      </div>
      <p className="text-sm"><Link className="font-bold text-pine underline" href="/login">I already have an account</Link></p>
    </main>
  );
}
