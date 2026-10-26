import { redirect } from "next/navigation";
import { getSession, listMyOrgs } from "@/server/context";

export default async function IndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.scope !== "full") redirect("/mfa");
  const orgs = await listMyOrgs(session.userId);
  if (orgs.length === 1) redirect(`/o/${orgs[0].slug}`);
  redirect("/orgs");
}
