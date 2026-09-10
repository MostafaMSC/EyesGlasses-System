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
import { idbDelete, idbGetAll, idbPut } from "@/lib/idbProductStore";

/** Legacy localStorage key, kept only to migrate existing products into IndexedDB once. */
const LEGACY_STORAGE_KEY = "abu-thar-custom-products-v1";

interface ProductStore {
  /** Demo catalogue plus anything added from the admin panel. */
  products: Product[];
  customProducts: Product[];
  /** False until the product database has been read (avoids hydration mismatch). */
  hydrated: boolean;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  isCustom: (id: string) => boolean;
  getById: (id: string) => Product | undefined;
}

const ProductStoreContext = createContext<ProductStore | null>(null);

function readLegacyStorage(): Product[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Product[]) : [];
  } catch {
    return [];
  }
}

/**
 * Loads products from IndexedDB. The very first time this runs after
 * upgrading from the old localStorage-only store, IndexedDB is empty but a
 * real catalogue may still be sitting in localStorage — that gets copied
 * over once. The old key is left in place afterward (cheap insurance) rather
 * than deleted.
 */
async function loadProducts(): Promise<Product[]> {
  const fromDb = await idbGetAll<Product>();
  if (fromDb.length > 0) return fromDb;

  const legacy = readLegacyStorage();
  if (legacy.length === 0) return [];

  await Promise.all(legacy.map((p) => idbPut(p)));
  return legacy;
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [customProducts, setCustomProducts] = useState<Product[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount, never during render — IndexedDB doesn't exist on the
  // server and reading it while rendering would desync hydration.
  useEffect(() => {
    let cancelled = false;
    loadProducts()
      .then((items) => {
        if (cancelled) return;
        setCustomProducts(items);
        setHydrated(true);
      })
      .catch((err) => {
        console.error("[productStore] Could not load products from IndexedDB", err);
        if (cancelled) return;
        // Degrade to whatever localStorage still has rather than showing an
        // empty catalogue — this session just won't persist new changes.
        setCustomProducts(readLegacyStorage());
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addProduct = useCallback(async (product: Product) => {
    setCustomProducts((prev) => [...prev, product]);
    await idbPut(product);
  }, []);

  const updateProduct = useCallback(async (id: string, product: Product) => {
    setCustomProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
    await idbPut(product);
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    setCustomProducts((prev) => prev.filter((p) => p.id !== id));
    await idbDelete(id);
  }, []);

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
    };
  }, [customProducts, hydrated, addProduct, updateProduct, deleteProduct]);

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
