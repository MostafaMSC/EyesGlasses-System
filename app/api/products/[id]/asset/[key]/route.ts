import { getProduct } from "@/lib/db";
import { decodeDataUrl, getAssetField, isAssetKey } from "@/lib/productAssets";

export const dynamic = "force-dynamic";

/**
 * One picture (or embedded model) of one product, as bytes. The catalogue
 * listing links here instead of inlining the data — see
 * `lib/productAssets.ts` for the keys and why.
 *
 * The listing always links with `?v=<updated_at>`, and only that versioned
 * form is marked immutable: a save changes `updated_at`, so a changed
 * picture always gets a new URL and the old one can be cached forever. A
 * request without `v` (someone typing the URL) is served fresh each time.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  if (!isAssetKey(key)) return new Response("Not found", { status: 404 });

  try {
    const row = await getProduct(id);
    const value = row ? getAssetField(row.data, key) : undefined;
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
    console.error("[api/products] asset read failed", err);
    return new Response("Error", { status: 500 });
  }
}
