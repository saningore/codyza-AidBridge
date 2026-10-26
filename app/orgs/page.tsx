import Link from "next/link";
import { redirect } from "next/navigation";
import { titleCaseStatus } from "@/lib/format";
import { getSession, listMyOrgs } from "@/server/context";

export default async function OrgsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.scope !== "full") redirect("/mfa");
  const orgs = await listMyOrgs(session.userId);
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-4 px-4 py-12">
      <h1 className="font-serif text-4xl">Your organizations</h1>
      <ul className="grid gap-3">
        {orgs.map((org) => (
          <li key={org.id}>
            <Link className="card block hover:bg-mist" href={`/o/${org.slug}`}>
              <span className="font-serif text-2xl">{org.name}</span>
              <span className="mt-1 block text-sm">{titleCaseStatus(org.role)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {orgs.length === 0 ? <p>You are not a member of an organization yet.</p> : null}
    </main>
  );
}
