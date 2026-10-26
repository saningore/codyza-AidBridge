"use client";

import { useEffect, useState } from "react";

type Snapshot = { savedAt: string; cases: { id: string; code: string; summary: string }[] };

export function SyncStatus({ slug }: { slug: string }) {
  const [queued, setQueued] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const register = async () => {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
      const db = await openDb();
      const snapshot = await getSnapshot(db);
      if (snapshot?.orgSlug === slug) setSavedAt(snapshot.savedAt);
      setQueued(await countQueue(db));
      if (navigator.onLine) await flush(db, slug, setQueued);
    };
    register().catch(() => undefined);
    const onOnline = () => {
      openDb().then((db) => flush(db, slug, setQueued)).catch(() => undefined);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [slug]);

  useEffect(() => {
    if (!navigator.onLine) return;
    fetch(`/api/sync?slug=${encodeURIComponent(slug)}`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (body: Snapshot & { orgSlug?: string } | null) => {
        if (!body?.savedAt) return;
        const db = await openDb();
        await putSnapshot(db, body);
        setSavedAt(body.savedAt);
      })
      .catch(() => undefined);
  }, [slug]);

  if (!savedAt && queued === 0) return null;
  return (
    <div className="bg-mist px-4 py-2 text-center text-sm">
      {queued > 0 ? `${queued} change${queued === 1 ? "" : "s"} waiting to send. ` : null}
      {savedAt ? `Assigned records saved on this phone at ${new Date(savedAt).toLocaleString()}.` : "This phone has not saved a field queue yet."}
    </div>
  );
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("aidbridge", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot");
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "idempotencyKey" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getSnapshot(db: IDBDatabase) {
  return new Promise<(Snapshot & { orgSlug?: string }) | undefined>((resolve) => {
    const tx = db.transaction("snapshot", "readonly");
    const request = tx.objectStore("snapshot").get("current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

function putSnapshot(db: IDBDatabase, value: unknown) {
  return new Promise<void>((resolve) => {
    const tx = db.transaction("snapshot", "readwrite");
    tx.objectStore("snapshot").put(value, "current");
    tx.oncomplete = () => resolve();
  });
}

function countQueue(db: IDBDatabase) {
  return new Promise<number>((resolve) => {
    const tx = db.transaction("queue", "readonly");
    const request = tx.objectStore("queue").count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(0);
  });
}

async function flush(db: IDBDatabase, slug: string, setQueued: (count: number) => void) {
  const queued = await new Promise<{ idempotencyKey: string; kind: string; payload: unknown }[]>((resolve) => {
    const tx = db.transaction("queue", "readonly");
    const request = tx.objectStore("queue").getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => resolve([]);
  });
  if (queued.length === 0) return;
  const response = await fetch(`/api/sync?slug=${encodeURIComponent(slug)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mutations: queued }),
  });
  if (!response.ok) return;
  const body = (await response.json()) as { applied?: string[] };
  const applied = new Set(body.applied ?? []);
  await new Promise<void>((resolve) => {
    const tx = db.transaction("queue", "readwrite");
    for (const key of applied) tx.objectStore("queue").delete(key);
    tx.oncomplete = () => resolve();
  });
  setQueued(await countQueue(db));
}
