import { CouponError, evaluateCoupon } from "@/lib/coupons";
import { normalizePhone } from "@/lib/checkout";
import { getProduct } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Previews a coupon against the cart; the order applies it again itself. */
export async function POST(request: Request) {
  let body: { code?: unknown; items?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  const items = Array.isArray(body.items) ? (body.items as { productId?: unknown; quantity?: unknown }[]) : [];
  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : "";
  try {
    const lines = [];
    for (const it of items.slice(0, 20)) {
      if (typeof it.productId !== "string") continue;
      const row = await getProduct(it.productId);
      if (row) lines.push({ product: row.data, quantity: Math.max(1, Math.min(10, Math.floor(Number(it.quantity)) || 1)) });
    }
    const result = await evaluateCoupon(code, lines, phone || null);
    return Response.json({ code: result.coupon.code, discount: result.discount, type: result.coupon.type, value: result.coupon.value });
  } catch (err) {
    if (err instanceof CouponError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[api/coupons] validate failed", err);
    return Response.json({ error: "تعذّر التحقق من الكوبون." }, { status: 500 });
  }
}
