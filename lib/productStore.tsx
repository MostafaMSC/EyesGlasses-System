"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { products as demoProducts, type Product } from "@/data/products";
import { idbGetAll } from "@/lib/idbProductStore";

interface ProductStore {
  /** Static catalogue plus everything saved from the admin panel. */
  products: Product[];
  customProducts: Product[];
  /** False until the catalogue has been fetched (avoids hydration mismatch). */
  hydrated: boolean;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  isCustom: (id: string) => boolean;
  getById: (id: string) => Product | undefined;
  /**
   * Products still sitting in this browser's IndexedDB from before the
   * catalogue moved to the server, if any — so the admin panel can offer to
   * import them once. Empty for everyone else.
   */
  strandedLocalProducts: Product[];
  importLocalProducts: () => Promise<number>;
  /**
   * Saves a batch of products to the server, overwriting any with the same
   * id. Used to carry a catalogue exported on one machine over to another —
   * the IndexedDB import above can't, since browser storage is per-origin.
   */
  importProducts: (products: Product[]) => Promise<number>;
}

const ProductStoreContext = createContext<ProductStore | null>(null);

/**
 * The catalogue as the server lists it: pictures come as small URLs, not
 * inline data, so this is a few KB. Left to the browser's normal caching —
 * the server tags it with an ETag, so a repeat visit costs a 304, not the
 * body again, while an edit in the admin panel still shows up on the very
 * next load.
 */
async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products");
  if (!res.ok) throw new Error(`GET /api/products -> ${res.status}`);
  const body = (await res.json()) as { products?: Product[] };
  return body.products ?? [];
}

/**
 * The rows as stored, pictures inlined — the portable form for a JSON
 * backup, which has to work on another server. Admin session required.
 */
export async function fetchProductsFull(): Promise<Product[]> {
  const res = await fetch("/api/products?full=1", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/products?full=1 -> ${res.status}`);
  const body = (await res.json()) as { products?: Product[] };
  return body.products ?? [];
}

async function saveProduct(product: Product): Promise<void> {
  const res = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `POST /api/products -> ${res.status}`);
  }
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [customProducts, setCustomProducts] = useState<Product[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [strandedLocalProducts, setStrandedLocalProducts] = useState<Product[]>([]);

  // Fetched after mount rather than rendered on the server: the catalogue is
  // editable, so it must not be baked into a prerendered page.
  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((items) => {
        if (cancelled) return;
        setCustomProducts(items);
        setHydrated(true);
        // Only worth looking for orphaned local products when the server has
        // none — that's the "just upgraded, nothing migrated yet" case.
        if (items.length === 0) {
          idbGetAll<Product>()
            .then((local) => !cancelled && setStrandedLocalProducts(local))
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.error("[productStore] Could not load the catalogue", err);
        if (cancelled) return;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addProduct = useCallback(async (product: Product) => {
    // Saved first, then shown: unlike the old browser-local store this can
    // genuinely fail, and a card that appears and then vanishes on reload is
    // worse than an error. Re-fetched rather than appended, so the new card
    // gets its picture as a URL like every other rather than the megabyte of
    // data the form was holding.
    await saveProduct(product);
    setCustomProducts(await fetchProducts());
  }, []);

  const updateProduct = useCallback(async (id: string, product: Product) => {
    await saveProduct(product);
    setCustomProducts(await fetchProducts());
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `DELETE /api/products/${id} -> ${res.status}`);
    }
    setCustomProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const importProducts = useCallback(async (incoming: Product[]) => {
    if (incoming.length === 0) return 0;
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(incoming),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `POST /api/products -> ${res.status}`);
    }
    setCustomProducts(await fetchProducts());
    setStrandedLocalProducts([]);
    return incoming.length;
  }, []);

  const importLocalProducts = useCallback(
    async () => importProducts(await idbGetAll<Product>()),
    [importProducts]
  );

  const value = useMemo<ProductStore>(() => {
    const all = [...customProducts, ...demoProducts];
    return {
      products: all,
      customProducts,
      hydrated,
      addProduct,
      updateProduct,
      deleteProduct,
      isCustom: (id) => customProducts.some((p) => p.id === id),
      getById: (id) => all.find((p) => p.id === id),
      strandedLocalProducts,
      importLocalProducts,
      importProducts,
    };
  }, [
    customProducts,
    hydrated,
    addProduct,
    updateProduct,
    deleteProduct,
    strandedLocalProducts,
    importLocalProducts,
    importProducts,
  ]);

  return <ProductStoreContext.Provider value={value}>{children}</ProductStoreContext.Provider>;
}

export function useProductStore(): ProductStore {
  const ctx = useContext(ProductStoreContext);
  if (!ctx) throw new Error("useProductStore must be used within ProductsProvider");
  return ctx;
}

/** Stable id for a newly created product. */
export function newProductId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9؀-ۿ]+/g, "-")
      .replace(/^-+|-+$/g, "") || "frame"
  );
}
