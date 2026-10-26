"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/forms";

export function ActionForm({
  action,
  children,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  return (
    <form action={formAction} className="grid gap-3">
      {children}
      {state.error ? <p role="alert" className="text-sm font-bold text-clay">{state.error}</p> : null}
      {state.notice ? <p className="text-sm">{state.notice}</p> : null}
      {state.link ? (
        <p className="break-all rounded-xl bg-mist p-3 text-sm">
          <a className="underline" href={state.link}>{state.link}</a>
        </p>
      ) : null}
      <button className="btn" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
