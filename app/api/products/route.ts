import { createHash } from "node:crypto";
import { getProduct, listProducts, upsertProduct } from "@/lib/db";
import { isAdminRequest, requireAdmin } from "@/lib/adminAuth";
import { resolveIncomingAssets, toPublicProduct } from "@/lib/productAssets";
import { ratingSummary } from "@/lib/reviewsDb";
import type { Product } from "@/data/products";

/** Reads hit Postgres every time — the catalogue is editable from the admin panel. */
export const dynamic = "force-dynamic";

/**
 * The catalogue. Lightweight by default: pictures and embedded models are
 * replaced by URLs (see `lib/productAssets.ts`), which takes the response
 * from megabytes to a few KB so the cards can render at once.
 *
 * `?full=1` returns the rows exactly as stored, data URLs and all — for the
 * admin panel's JSON export, which has to be portable to another server
 * where these asset URLs would mean nothing. Admin only, since it is the
 * expensive shape.
 *
 * Sent with an ETag and `no-cache`, so the browser asks every time but gets
 * a bodiless 304 whenever nothing has changed — the catalogue stays live
 * for the admin without the payload being re-sent to everyone else.
 */
export async function GET(request: Request) {
  const full = new URL(request.url).searchParams.get("full") === "1";
  if (full && !(await isAdminRequest())) {
    return Response.json({ error: "غير مصرح." }, { status: 401 });
  }

  try {
    const rows = await listProducts();
    let products: Product[];
    if (full) {
      products = rows.map((r) => r.data);
    } else {
      // Approved-review averages ride along, for the cards and the rating sort.
      const ratings = await ratingSummary();
      products = rows.map((r) => ({ ...toPublicProduct(r.data, r.updatedAt), rating: ratings.get(r.data.id) }));
    }
    const body = JSON.stringify({ products });
    const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": full ? "private, no-store" : "no-cache",
      ETag: etag,
    };
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { headers });
  } catch (err) {
    console.error("[api/products] list failed", err);
    return Response.json({ error: "تعذّر قراءة المنتجات." }, { status: 500 });
  }
}

/** Minimal shape check — enough to keep a malformed row out of the catalogue. */
function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Product>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.brand === "string" &&
    typeof p.name === "string" &&
    typeof p.price === "number" &&
    Boolean(p.tryOn) &&
    typeof p.tryOn === "object"
  );
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }

  // Accepts one product or an array, so the admin panel's one-time import of
  // browser-stored products is the same endpoint as adding a single frame.
  const incoming = Array.isArray(body) ? body : [body];
  if (incoming.length === 0 || !incoming.every(isProduct)) {
    return Response.json({ error: "بيانات المنتج ناقصة أو غير صحيحة." }, { status: 400 });
  }

  try {
    for (const product of incoming) {
      // An edit arrives with asset URLs where the listing put them; the data
      // they stand for is still in the stored row.
      const stored = await getProduct(product.id);
      await upsertProduct(resolveIncomingAssets(product, stored?.data ?? null));
    }
    return Response.json({ saved: incoming.length });
  } catch (err) {
    console.error("[api/products] save failed", err);
    return Response.json({ error: "تعذّر حفظ المنتج." }, { status: 500 });
  }
}
