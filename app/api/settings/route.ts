import { createHash } from "node:crypto";
import { getPublicSettings } from "@/lib/settingsDb";

export const dynamic = "force-dynamic";

/**
 * Everything the storefront needs to render itself: store identity, delivery
 * zones, payment methods, categories, homepage content, navigation, pages.
 * Embedded pictures come as URLs (see `lib/settingsDb.ts`), so this stays a
 * few KB. ETag + `no-cache`: fresh after an admin edit, a 304 otherwise.
 */
export async function GET(request: Request) {
  try {
    const body = JSON.stringify({ settings: await getPublicSettings() });
    const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-cache", ETag: etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(body, { headers });
  } catch (err) {
    console.error("[api/settings] read failed", err);
    return Response.json({ error: "تعذّر قراءة الإعدادات." }, { status: 500 });
  }
}
