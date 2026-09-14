import { requireAdmin } from "@/lib/adminAuth";
import { getOrderById, updateOrder } from "@/lib/ordersDb";
import { ORDER_STATUSES, type OrderStatus, type PaymentStatus } from "@/data/orders";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return Response.json({ error: "الطلب غير موجود." }, { status: 404 });
  return Response.json({ order }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Admin edits: status, payment status, notes. Everything else is immutable. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  let body: { status?: unknown; paymentStatus?: unknown; adminNotes?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }

  const order = await getOrderById(id);
  if (!order) return Response.json({ error: "الطلب غير موجود." }, { status: 404 });

  const now = new Date().toISOString();
  if (typeof body.status === "string") {
    if (!(ORDER_STATUSES as string[]).includes(body.status)) {
      return Response.json({ error: "حالة غير معروفة." }, { status: 400 });
    }
    if (body.status !== order.status) {
      order.status = body.status as OrderStatus;
      order.history.push({
        status: order.status,
        at: now,
        note: typeof body.note === "string" ? body.note.slice(0, 200) : undefined,
      });
    }
  }
  if (typeof body.paymentStatus === "string") {
    if (!["unpaid", "paid", "refunded"].includes(body.paymentStatus)) {
      return Response.json({ error: "حالة دفع غير معروفة." }, { status: 400 });
    }
    order.paymentStatus = body.paymentStatus as PaymentStatus;
  }
  if (typeof body.adminNotes === "string") order.adminNotes = body.adminNotes.slice(0, 2000);
  order.updatedAt = now;

  try {
    await updateOrder(order);
    return Response.json({ order });
  } catch (err) {
    console.error("[api/orders] update failed", err);
    return Response.json({ error: "تعذّر تحديث الطلب." }, { status: 500 });
  }
}
