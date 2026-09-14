"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { track } from "@/lib/analytics";

/**
 * Cross-page UI state: which product the camera try-on is showing. Product
 * details have their own pages (`/products/[slug]`), so nothing else lives
 * here.
 */
interface ShopUIState {
  tryOnProductId: string | null;
  openTryOn: (id: string) => void;
  closeTryOn: () => void;
  setTryOnProductId: (id: string) => void;
}

const ShopUIContext = createContext<ShopUIState | null>(null);

export function ShopUIProvider({ children }: { children: ReactNode }) {
  const [tryOnProductId, setTryOnProductIdState] = useState<string | null>(null);

  const openTryOn = useCallback((id: string) => {
    setTryOnProductIdState(id);
    track("tryon_open", id);
  }, []);
  const closeTryOn = useCallback(() => setTryOnProductIdState(null), []);
  // Switching frames inside the try-on — counted separately from opening it.
  const setTryOnProductId = useCallback((id: string) => {
    setTryOnProductIdState(id);
    track("tryon_select", id);
  }, []);

  const value = useMemo(
    () => ({ tryOnProductId, openTryOn, closeTryOn, setTryOnProductId }),
    [tryOnProductId, openTryOn, closeTryOn, setTryOnProductId]
  );

  return <ShopUIContext.Provider value={value}>{children}</ShopUIContext.Provider>;
}

export function useShopUI(): ShopUIState {
  const ctx = useContext(ShopUIContext);
  if (!ctx) throw new Error("useShopUI must be used within ShopUIProvider");
  return ctx;
}
