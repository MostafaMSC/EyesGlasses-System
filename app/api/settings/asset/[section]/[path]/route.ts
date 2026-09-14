import { SETTINGS_SECTIONS, type SettingsSection } from "@/data/siteSettings";
import { decodeDataUrl } from "@/lib/dataUrlAssets";
import { getSettingsAsset } from "@/lib/settingsDb";

export const dynamic = "force-dynamic";

/** A picture embedded in a settings section (logo, hero, banner…), as bytes. */
export async function GET(request: Request, { params }: { params: Promise<{ section: string; path: string }> }) {
  const { section, path } = await params;
  if (!(SETTINGS_SECTIONS as string[]).includes(section) || !/^[\w.-]{1,120}$/.test(path)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const value = await getSettingsAsset(section as SettingsSection, path);
    const asset = value ? decodeDataUrl(value) : null;
    if (!asset) return new Response("Not found", { status: 404 });
    const versioned = new URL(request.url).searchParams.has("v");
    return new Response(new Uint8Array(asset.body), {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.body.length),
        "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  } catch (err) {
    console.error("[api/settings] asset read failed", err);
    return new Response("Error", { status: 500 });
  }
}
