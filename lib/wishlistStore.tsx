"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Saved products. Product ids in localStorage — the same shape a signed-in
 * customer's server-side list would have, so switching the storage later
 * changes nothing that uses this hook.
 */
interface WishlistStore {
  ids: string[];
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
  remove: (productId: string) => void;
}

const STORAGE_KEY = "abu-thar-wishlist";
const WishlistContext = createContext<WishlistStore | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
        setIds(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
      } catch {
        setIds([]);
      }
      setRestored(true);
    });
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Nothing to do: the list just doesn't survive a reload.
    }
  }, [ids, restored]);

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const remove = useCallback((id: string) => setIds((prev) => prev.filter((x) => x !== id)), []);

  const value = useMemo(() => ({ ids, has, toggle, remove }), [ids, has, toggle, remove]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistStore {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
