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

const STORAGE_KEY = "abu-thar-custom-products-v1";

interface ProductStore {
  /** Demo catalogue plus anything added from the admin panel. */
  products: Product[];
  customProducts: Product[];
  /** False until localStorage has been read (avoids hydration mismatch). */
  hydrated: boolean;
  addProduct: (product: Product) => void;
  updateProduct: (id: string, product: Product) => void;
  deleteProduct: (id: string) => void;
  isCustom: (id: string) => boolean;
  getById: (id: string) => Product | undefined;
}

const ProductStoreContext = createContext<ProductStore | null>(null);

function readStorage(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Product[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: Product[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    // Most likely the 5MB quota, hit by embedding large images.
    console.error("[productStore] Could not save products", err);
    throw err;
  }
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [customProducts, setCustomProducts] = useState<Product[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount, never during render — localStorage doesn't exist on the
  // server and reading it while rendering would desync hydration.
  useEffect(() => {
    queueMicrotask(() => {
      setCustomProducts(readStorage());
      setHydrated(true);
    });
  }, []);

  const persist = useCallback((next: Product[]) => {
    setCustomProducts(next);
    writeStorage(next);
  }, []);

  const addProduct = useCallback(
    (product: Product) => persist([...readStorage(), product]),
    [persist]
  );

  const updateProduct = useCallback(
    (id: string, product: Product) =>
      persist(readStorage().map((p) => (p.id === id ? product : p))),
    [persist]
  );

  const deleteProduct = useCallback(
    (id: string) => persist(readStorage().filter((p) => p.id !== id)),
    [persist]
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
