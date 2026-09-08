"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface ShopUIState {
  detailsProductId: string | null;
  tryOnProductId: string | null;
  openDetails: (id: string) => void;
  closeDetails: () => void;
  openTryOn: (id: string) => void;
  closeTryOn: () => void;
  setTryOnProductId: (id: string) => void;
}

const ShopUIContext = createContext<ShopUIState | null>(null);

export function ShopUIProvider({ children }: { children: ReactNode }) {
  const [detailsProductId, setDetailsProductId] = useState<string | null>(null);
  const [tryOnProductId, setTryOnProductId] = useState<string | null>(null);

  const openDetails = useCallback((id: string) => setDetailsProductId(id), []);
  const closeDetails = useCallback(() => setDetailsProductId(null), []);
  const openTryOn = useCallback((id: string) => setTryOnProductId(id), []);
  const closeTryOn = useCallback(() => setTryOnProductId(null), []);

  const value = useMemo(
    () => ({
      detailsProductId,
      tryOnProductId,
      openDetails,
      closeDetails,
      openTryOn,
      closeTryOn,
      setTryOnProductId,
    }),
    [detailsProductId, tryOnProductId, openDetails, closeDetails, openTryOn, closeTryOn]
  );

  return <ShopUIContext.Provider value={value}>{children}</ShopUIContext.Provider>;
}

export function useShopUI(): ShopUIState {
  const ctx = useContext(ShopUIContext);
  if (!ctx) throw new Error("useShopUI must be used within ShopUIProvider");
  return ctx;
}
