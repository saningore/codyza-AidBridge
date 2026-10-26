import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/server/context";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.scope === "full") redirect("/");
  if (session?.scope === "enroll") redirect("/mfa");
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-bold text-pine">AidBridge</p>
        <h1 className="font-serif text-4xl tracking-tight">Sign in</h1>
        <p className="mt-2 text-ink/75">Casework, households, stock, and volunteers for one organization at a time.</p>
      </div>
      <div className="card">
        <LoginForm />
      </div>
      <p className="text-sm">New organization? <Link className="font-bold text-pine underline" href="/start">Create one</Link></p>
    </main>
  );
}
