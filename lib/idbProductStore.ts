"use client";

/**
 * Minimal Promise wrapper around the native IndexedDB API for storing
 * products. Hand-rolled rather than pulling in a dependency (`idb` etc.),
 * matching this codebase's existing pattern of small hand-written utilities
 * — the surface needed here (get-all / put / delete, keyed by `id`) is tiny.
 *
 * IndexedDB replaces localStorage as the product store because a product can
 * now carry up to three overlay images (front/left/right); localStorage's
 * ~5MB total budget would be exhausted after only a couple of products.
 */

const DB_NAME = "abu-thar-eyewear";
const DB_VERSION = 1;
const STORE_NAME = "products";

/**
 * A fresh connection per call would never get closed (no operation here
 * calls `db.close()`), and those leaked connections pile up over the page's
 * lifetime — harmless individually, but each one blocks a later version
 * upgrade or `deleteDatabase` from ever completing, since IndexedDB waits
 * for every open connection to close first. Opening once and reusing the
 * same connection avoids the leak entirely — same pattern as the shared
 * MediaPipe landmarker in useFaceLandmarker.ts, and for the same reason.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Could not open the product database."));
    });
    dbPromise.catch(() => {
      // Let a later call retry from scratch instead of staying broken.
      dbPromise = null;
    });
  }
  return dbPromise;
}

export async function idbGetAll<T>(): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error("Could not read products."));
  });
}

export async function idbPut<T extends { id: string }>(item: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save the product."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not save the product."));
  });
}

export async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not delete the product."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not delete the product."));
  });
}
