"use client";

import { useActionState } from "react";
import { confirmLogin, login } from "@/server/auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "", step: "password" as const });
  const [totpState, totpAction, totpPending] = useActionState(confirmLogin, { error: "", step: "totp" as const });
  const showCode = state.step === "totp";
  return (
    <div className="grid gap-4">
      {showCode ? (
        <form action={totpAction} className="grid gap-3">
          <p>Enter the 6-digit code from your authenticator app.</p>
          <label className="field">Authentication code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </label>
          {totpState.error ? <p role="alert" className="text-sm font-bold text-clay">{totpState.error}</p> : null}
          <button className="btn" disabled={totpPending}>{totpPending ? "Checking…" : "Confirm code"}</button>
        </form>
      ) : (
        <form action={action} className="grid gap-3">
          <label className="field">Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {state.error ? <p role="alert" className="text-sm font-bold text-clay">{state.error}</p> : null}
          <button className="btn" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        </form>
      )}
    </div>
  );
}
