const request = indexedDB.open("aidbridge", 1);
request.onupgradeneeded = () => {
  const db = request.result;
  if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot");
  if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "idempotencyKey" });
};
request.onsuccess = () => {
  const db = request.result;
  const read = db.transaction("snapshot", "readonly").objectStore("snapshot").get("current");
  read.onsuccess = () => render(db, read.result);
};

function render(db, snapshot) {
  const status = document.querySelector("#status");
  const list = document.querySelector("#list");
  if (!snapshot) {
    status.textContent = "This phone has not saved a field queue yet. Open AidBridge once while online.";
    return;
  }
  status.textContent = `${snapshot.orgName} saved at ${new Date(snapshot.savedAt).toLocaleString()}.`;
  for (const item of snapshot.cases || []) {
    const article = document.createElement("article");
    const title = document.createElement("h2");
    title.textContent = `${item.code} · ${item.summary}`;
    const meta = document.createElement("p");
    meta.textContent = `${item.household} · ${item.status}`;
    const label = document.createElement("label");
    label.textContent = "Note to send when you reconnect";
    const area = document.createElement("textarea");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Keep note on this phone";
    button.addEventListener("click", () => {
      const body = area.value.trim();
      if (body.length < 2) return;
      const mutation = {
        idempotencyKey: crypto.randomUUID(),
        kind: "case_note",
        payload: { caseId: item.id, body },
      };
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").put(mutation);
      tx.oncomplete = () => {
        area.value = "";
        status.textContent = "Note saved on this phone. It sends the next time AidBridge is open online.";
      };
    });
    label.append(document.createElement("br"), area);
    article.append(title, meta, label, button);
    list.append(article);
  }
}
