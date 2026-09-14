"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultSettings, type SiteSettings } from "@/data/siteSettings";
import { runtimeConfig } from "@/lib/runtimeConfig";

/**
 * The site settings, as the storefront sees them. Rendered from the
 * built-in defaults first — the content the site shipped with — and swapped
 * for the server's values as soon as `/api/settings` answers, which is a
 * few KB and a 304 on repeat visits. The admin panel refreshes it after a
 * save through `reload`.
 */
interface SettingsStore {
  settings: SiteSettings;
  /** False until the server has answered once. */
  loaded: boolean;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsStore | null>(null);

async function fetchSettings(): Promise<SiteSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`GET /api/settings -> ${res.status}`);
  const body = (await res.json()) as { settings?: SiteSettings };
  if (!body.settings) throw new Error("Malformed settings response");
  return body.settings;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    try {
      setSettings(await fetchSettings());
    } catch (err) {
      console.error("[settings] Could not load the site settings", err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch((err) => console.error("[settings] Could not load the site settings", err))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the hook-less helpers (price formatting, WhatsApp links) in step.
  useEffect(() => {
    runtimeConfig.currency = settings.store.currency || defaultSettings.store.currency;
    runtimeConfig.whatsappNumber = settings.store.whatsappNumber || defaultSettings.store.whatsappNumber;
    runtimeConfig.storeName = settings.store.name || defaultSettings.store.name;
  }, [settings]);

  const value = useMemo(() => ({ settings, loaded, reload }), [settings, loaded]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsStore {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

/** Active categories in display order. */
export function useCategories() {
  const { settings } = useSettings();
  return useMemo(
    () => settings.catalog.categories.filter((c) => c.active).sort((a, b) => a.order - b.order),
    [settings.catalog.categories]
  );
}
