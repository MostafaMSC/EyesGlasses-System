import { listProducts, upsertProduct } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import type { Product } from "@/data/products";

/** Reads hit Postgres every time — the catalogue is editable from the admin panel. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ products: await listProducts() });
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
    for (const product of incoming) await upsertProduct(product);
    return Response.json({ saved: incoming.length });
  } catch (err) {
    console.error("[api/products] save failed", err);
    return Response.json({ error: "تعذّر حفظ المنتج." }, { status: 500 });
  }
}
