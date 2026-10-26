import Link from "next/link";
import { logout } from "@/server/auth-actions";
import type { OrgContext } from "@/server/context";
import { visibleNav } from "@/lib/nav";
import { titleCaseStatus } from "@/lib/format";
import { SyncStatus } from "@/components/sync-status";

export async function Shell({ ctx, children }: { ctx: OrgContext; children: React.ReactNode }) {
  const links = visibleNav(ctx.can);
  return (
    <div>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href={`/o/${ctx.slug}`} className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-deep text-card" aria-hidden="true">
              <svg viewBox="0 0 32 32" className="h-7 w-7"><path d="M5 21h22M8 21V14h3v7M21 21V14h3v7M11 14c0-4 10-4 10 0" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            </span>
            <span>
              <span className="block font-serif text-2xl leading-none">AidBridge</span>
              <span className="text-sm text-ink/70">{ctx.orgName}</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold">{ctx.name}</span>
            <span className="badge">{titleCaseStatus(ctx.role)}</span>
            <form action={logout}><button className="btn-secondary">Sign out</button></form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-3" aria-label="Organization">
          {links.map((item) => (
            <Link key={item.href} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 py-2 text-sm font-bold hover:bg-mist" href={`/o/${ctx.slug}${item.href}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {ctx.demo ? (
        <div className="bg-sand px-4 py-2 text-center text-sm font-bold">Sample organization for local checks. These are not live client records.</div>
      ) : null}
      <SyncStatus slug={ctx.slug} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

export function PageIntro({ title, lede, action }: { title: string; lede?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-ink/75">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}
