import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireOrg } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  if (!ctx) notFound();
  return <Shell ctx={ctx}>{children}</Shell>;
}
