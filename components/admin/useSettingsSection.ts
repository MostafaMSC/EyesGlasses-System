"use client";

import { useCallback, useEffect, useState } from "react";
import type { SettingsSection, SiteSettings } from "@/data/siteSettings";
import { useSettings } from "@/lib/settingsStore";

/**
 * Loads one settings section in its stored form (pictures inline) for
 * editing, saves it back, and refreshes the storefront's copy so the change
 * shows immediately in the same tab.
 */
export function useSettingsSection<K extends SettingsSection>(section: K) {
  const { reload } = useSettings();
  const [data, setData] = useState<SiteSettings[K] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/${section}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: SiteSettings[K]; error?: string } | null;
        if (!res.ok || !body?.data) throw new Error(body?.error ?? "تعذّر قراءة الإعدادات.");
        if (!cancelled) setData(body.data);
      })
      .catch((err) => !cancelled && setMessage({ kind: "error", text: err instanceof Error ? err.message : "تعذّر قراءة الإعدادات." }));
    return () => {
      cancelled = true;
    };
  }, [section]);

  const update = useCallback((patch: Partial<SiteSettings[K]> | ((d: SiteSettings[K]) => SiteSettings[K])) => {
    setData((d) => (d ? (typeof patch === "function" ? patch(d) : { ...d, ...patch }) : d));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/settings/${section}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "تعذّر الحفظ.");
      setDirty(false);
      setMessage({ kind: "ok", text: "تم الحفظ، والتغييرات ظاهرة الآن في المتجر." });
      await reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "تعذّر الحفظ." });
    } finally {
      setSaving(false);
    }
  }, [data, section, reload]);

  return { data, update, save, saving, dirty, message, setMessage };
}

/** Stable id for a new list entry (zone, banner, nav item…). */
export function newId(prefix = "i"): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
