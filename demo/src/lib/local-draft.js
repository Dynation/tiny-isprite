const DB = "tiny-isprite-local-draft",
  STORE = "workspace";
function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Local storage is unavailable."));
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Another tab is blocking local storage."));
  });
}
async function operation(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode),
        request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("Draft save interrupted."));
    });
  } finally {
    db.close();
  }
}
export async function loadDraft() {
  const draft = await operation("readonly", (store) => store.get("latest"));
  if (!draft) return null;
  if (
    draft.version !== 1 ||
    !Array.isArray(draft.icons) ||
    draft.icons.length > 80 ||
    !draft.icons.every(
      (icon) =>
        typeof icon.name === "string" &&
        /^[\w-]+$/.test(icon.name) &&
        typeof icon.content === "string" &&
        icon.content.length <= 2 * 1024 * 1024,
    ) ||
    !draft.options ||
    typeof draft.options !== "object"
  )
    throw new Error("The saved draft could not be restored.");
  return draft;
}
let writes = Promise.resolve();
export function saveDraft(draft) {
  // Enforce the same source budget at save time so we never write a draft
  // that our restore path would reject. The previous saved draft stays intact.
  if (
    draft.icons.some(
      (icon) => new TextEncoder().encode(icon.content).length > 2 * 1024 * 1024,
    )
  )
    return Promise.reject(new Error("Draft SVG exceeds the restore limit."));
  const next = writes
    .catch(() => {})
    .then(() => operation("readwrite", (store) => store.put(draft, "latest")));
  writes = next;
  return next;
}
