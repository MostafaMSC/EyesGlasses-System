import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { listProducts } from "@/lib/db";
import { getSettingsSection } from "@/lib/settingsDb";
import { isActive } from "@/data/products";

export const dynamic = "force-dynamic";

async function origin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await origin();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/catalog`, changeFrequency: "daily", priority: 0.9 },
  ];
  try {
    const [rows, pages, catalog] = await Promise.all([
      listProducts(),
      getSettingsSection("pages"),
      getSettingsSection("catalog"),
    ]);
    for (const c of catalog.data.categories.filter((c) => c.active)) {
      entries.push({ url: `${base}/catalog?category=${c.slug}`, changeFrequency: "weekly", priority: 0.7 });
    }
    for (const r of rows) {
      if (!isActive(r.data)) continue;
      entries.push({
        url: `${base}/products/${encodeURIComponent(r.data.slug)}`,
        lastModified: r.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    for (const p of pages.data.pages.filter((p) => p.published)) {
      entries.push({ url: `${base}/pages/${p.slug}`, changeFrequency: "monthly", priority: 0.4 });
    }
  } catch {
    // Without a database the static entries still make a valid sitemap.
  }
  return entries;
}
