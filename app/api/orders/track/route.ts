import { getOrderByNumber } from "@/lib/ordersDb";
import { normalizePhone } from "@/lib/checkout";

export const dynamic = "force-dynamic";

/**
 * Customer order tracking: the order number alone is not enough, the phone
 * it was placed with must match too, so a guessed number reveals nothing.
 * Returns the order minus the admin's private notes.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const number = (q.get("number") ?? "").trim().toUpperCase();
  const phone = normalizePhone(q.get("phone") ?? "");
  if (!number || !phone) return Response.json({ error: "أدخل رقم الطلب ورقم الهاتف." }, { status: 400 });

  try {
    const order = await getOrderByNumber(number);
    if (!order || order.customer.phone !== phone) {
      return Response.json({ error: "لم نجد طلباً بهذا الرقم والهاتف." }, { status: 404 });
    }
    return Response.json(
      { order: { ...order, adminNotes: "" } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[api/orders] track failed", err);
    return Response.json({ error: "تعذّر البحث عن الطلب." }, { status: 500 });
  }
}
