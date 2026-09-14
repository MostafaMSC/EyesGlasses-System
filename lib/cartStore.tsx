"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { track } from "@/lib/analytics";

/**
 * The shopping cart. Lines are product ids and quantities only — prices and
 * pictures are always looked up from the live catalogue, so a price change
 * in admin shows in the cart at once and a deleted product simply drops
 * out. Persisted in localStorage so a refresh (or coming back tomorrow)
 * keeps it; a signed-in customer's cart would sync the same lines server
 * side later without changing any of this.
 */
export interface CartLine {
  productId: string;
  quantity: number;
  /** Chosen colour name, when the product offers more than one. */
  color?: string;
}

export interface CartEntry extends CartLine {
  product: Product;
  lineTotal: number;
}

interface CartStore {
  lines: CartLine[];
  /** Lines joined with their products; lines whose product is gone are omitted. */
  entries: CartEntry[];
  count: number;
  subtotal: number;
  add: (productId: string, quantity?: number, color?: string) => void;
  setQuantity: (productId: string, quantity: number, color?: string) => void;
  remove: (productId: string, color?: string) => void;
  clear: () => void;
  /** Whether the cart drawer is open. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

const STORAGE_KEY = "abu-thar-cart";
export const MAX_QTY = 10;

const CartContext = createContext<CartStore | null>(null);

function readStored(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is CartLine => Boolean(l) && typeof l.productId === "string" && Number(l.quantity) >= 1)
      .map((l) => ({ productId: l.productId, quantity: Math.min(MAX_QTY, Math.floor(Number(l.quantity))), color: l.color }));
  } catch {
    return [];
  }
}

const sameLine = (a: CartLine, productId: string, color?: string) => a.productId === productId && (a.color ?? "") === (color ?? "");

export function CartProvider({ children }: { children: ReactNode }) {
  const { getById, hydrated } = useProductStore();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  // Read after mount: localStorage isn't there during server rendering.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setLines(readStored());
      setRestored(true);
    });
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private mode or a full quota: the cart just doesn't survive a reload.
    }
  }, [lines, restored]);

  const add = useCallback((productId: string, quantity = 1, color?: string) => {
    setLines((prev) => {
      const existing = prev.find((l) => sameLine(l, productId, color));
      if (existing) {
        return prev.map((l) =>
          l === existing ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l
        );
      }
      return [...prev, { productId, quantity: Math.min(MAX_QTY, quantity), color }];
    });
    track("add_to_cart", productId);
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number, color?: string) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => !sameLine(l, productId, color))
        : prev.map((l) => (sameLine(l, productId, color) ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l))
    );
  }, []);

  const remove = useCallback((productId: string, color?: string) => {
    setLines((prev) => prev.filter((l) => !sameLine(l, productId, color)));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const entries = useMemo<CartEntry[]>(() => {
    if (!hydrated) return [];
    const out: CartEntry[] = [];
    for (const line of lines) {
      const product = getById(line.productId);
      if (!product || product.active === false) continue;
      out.push({ ...line, product, lineTotal: product.price * line.quantity });
    }
    return out;
  }, [lines, getById, hydrated]);

  const value = useMemo<CartStore>(
    () => ({
      lines,
      entries,
      count: entries.reduce((n, e) => n + e.quantity, 0),
      subtotal: entries.reduce((n, e) => n + e.lineTotal, 0),
      add,
      setQuantity,
      remove,
      clear,
      open,
      setOpen,
    }),
    [lines, entries, add, setQuantity, remove, clear, open]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartStore {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
