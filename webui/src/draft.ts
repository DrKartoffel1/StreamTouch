import { referencedAssets } from "./background";
import type { Config } from "./config";
export interface Draft {
  config: Config;
  baseline: Config;
  icons: Record<string, Blob>;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("streamtouch-studio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
interface StoredDraft extends Omit<Draft, "icons"> {
  icons: Record<string, { bytes: ArrayBuffer; type: string } | Blob>;
}
export async function loadDraft(): Promise<Draft | undefined> {
  const db = await open();
  try {
    const stored = await new Promise<StoredDraft | undefined>(
      (resolve, reject) => {
        const r = db.transaction("drafts").objectStore("drafts").get("current");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      },
    );
    if (!stored) return undefined;
    return {
      ...stored,
      icons: Object.fromEntries(
        Object.entries(stored.icons).map(([path, icon]) => [
          path,
          icon instanceof Blob
            ? icon
            : new Blob([icon.bytes], { type: icon.type }),
        ]),
      ),
    };
  } finally {
    db.close();
  }
}
async function persistDraft(draft: Draft) {
  const references = referencedAssets(draft.config);
  const icons = Object.fromEntries(
    await Promise.all(
      Object.entries(draft.icons)
        .filter(([path]) => references.has(path))
        .map(async ([path, blob]) => [
          path,
          { bytes: await blob.arrayBuffer(), type: blob.type },
        ]),
    ),
  );
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put({ ...draft, icons }, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Blob preparation can finish out of order; preserve the order of user edits.
let pendingSave: Promise<void> = Promise.resolve();
export function saveDraft(draft: Draft): Promise<void> {
  const saved = pendingSave.then(() => persistDraft(draft));
  pendingSave = saved.catch(() => {});
  return saved;
}
