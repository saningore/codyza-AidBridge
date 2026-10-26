"use client";

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-serif text-4xl">Something went wrong</h1>
      <p className="mt-3">The change was not saved. Try it again, or go back to the previous page.</p>
      <p className="mt-2 text-sm text-ink/60">{error.digest ?? "Unexpected error"}</p>
    </main>
  );
}
