import { requireAdmin } from "@/lib/adminAuth";
import { CheckoutError, placeOrder } from "@/lib/checkout";
import { listOrders } from "@/lib/ordersDb";
import { ORDER_STATUSES, type OrderStatus } from "@/data/orders";

export const dynamic = "force-dynamic";

/** Places an order. Public; everything about money is recomputed server-side. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }
  try {
    const order = await placeOrder(body);
    return Response.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof CheckoutError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[api/orders] create failed", err);
    return Response.json({ error: "تعذّر إرسال الطلب، حاول مرة أخرى." }, { status: 500 });
  }
}

/** The admin's order list, filtered. */
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const status = q.get("status") ?? "";
  try {
    const result = await listOrders({
      status: (ORDER_STATUSES as string[]).includes(status) ? (status as OrderStatus) : undefined,
      query: q.get("q")?.trim() || undefined,
      from: q.get("from") || undefined,
      to: q.get("to") || undefined,
      limit: Number(q.get("limit")) || 50,
      offset: Number(q.get("offset")) || 0,
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[api/orders] list failed", err);
    return Response.json({ error: "تعذّر قراءة الطلبات." }, { status: 500 });
  }
}
