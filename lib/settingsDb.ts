import { ensureSchema, pool } from "@/lib/db";
import {
  defaultSettings,
  SETTINGS_SECTIONS,
  type SettingsSection,
  type SiteSettings,
} from "@/data/siteSettings";
import { getAtPath, mergeDefaults, projectDataUrls, restoreDataUrls } from "@/lib/dataUrlAssets";

/**
 * Site settings: one row per section in `settings (key, data, updated_at)`.
 *
 * Read paths always go through `mergeDefaults`, so the code's defaults fill
 * anything a stored section lacks — a fresh database has no rows at all and
 * still yields a complete `SiteSettings`.
 */

export interface SettingsRow<K extends SettingsSection = SettingsSection> {
  section: K;
  data: SiteSettings[K];
  updatedAt: Date | null;
}

export async function getSettingsSection<K extends SettingsSection>(section: K): Promise<SettingsRow<K>> {
  await ensureSchema();
  const { rows } = await pool().query<{ data: unknown; updated_at: Date }>(
    "SELECT data, updated_at FROM settings WHERE key = $1",
    [section]
  );
  const row = rows[0];
  return {
    section,
    data: mergeDefaults(defaultSettings[section], row?.data),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function getAllSettings(): Promise<{ settings: SiteSettings; updatedAt: Map<SettingsSection, Date | null> }> {
  await ensureSchema();
  const { rows } = await pool().query<{ key: string; data: unknown; updated_at: Date }>(
    "SELECT key, data, updated_at FROM settings"
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const settings: Record<string, unknown> = {};
  const updatedAt = new Map<SettingsSection, Date | null>();
  for (const section of SETTINGS_SECTIONS) {
    const row = byKey.get(section);
    settings[section] = mergeDefaults(defaultSettings[section], row?.data);
    updatedAt.set(section, row?.updated_at ?? null);
  }
  return { settings: settings as unknown as SiteSettings, updatedAt };
}

export async function saveSettingsSection<K extends SettingsSection>(section: K, data: SiteSettings[K]): Promise<void> {
  await ensureSchema();
  await pool().query(
    `INSERT INTO settings (key, data) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = now()`,
    [section, data]
  );
}

/**
 * Same trick as product pictures: embedded images (logo, hero, banners,
 * category pictures) leave the settings response as versioned URLs to
 * `/api/settings/asset/{section}/{path}` and are fetched — and cached —
 * only where shown.
 */
function assetUrl(section: SettingsSection, path: string, version: string): string {
  return `/api/settings/asset/${section}/${encodeURIComponent(path)}?v=${version}`;
}

export function toPublicSection<K extends SettingsSection>(section: K, data: SiteSettings[K], updatedAt: Date | null): SiteSettings[K] {
  const version = (updatedAt?.getTime() ?? 0).toString(36);
  return projectDataUrls(data, (path) => assetUrl(section, path, version)) as SiteSettings[K];
}

export function resolveIncomingSection<K extends SettingsSection>(section: K, incoming: SiteSettings[K], stored: SiteSettings[K]): SiteSettings[K] {
  const prefix = `/api/settings/asset/${section}/`;
  return restoreDataUrls(incoming, stored, (value, path) => value.startsWith(prefix + encodeURIComponent(path))) as SiteSettings[K];
}

/** The stored data URL at `path` inside a section, if there is one. */
export async function getSettingsAsset(section: SettingsSection, path: string): Promise<string | null> {
  const { data } = await getSettingsSection(section);
  const value = getAtPath(data, path);
  return typeof value === "string" && value.startsWith("data:") ? value : null;
}

/** Public shape of the whole thing, for `/api/settings` and server components. */
export async function getPublicSettings(): Promise<SiteSettings> {
  const { settings, updatedAt } = await getAllSettings();
  const out: Record<string, unknown> = {};
  for (const section of SETTINGS_SECTIONS) {
    out[section] = toPublicSection(section, settings[section], updatedAt.get(section) ?? null);
  }
  return out as unknown as SiteSettings;
}
