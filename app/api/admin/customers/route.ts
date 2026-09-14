import { requireAdmin } from "@/lib/adminAuth";
import { listCustomers, listOrders } from "@/lib/ordersDb";

export const dynamic = "force-dynamic";

/** Customers as seen through their orders; `?phone=` returns one customer's orders. */
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const phone = new URL(request.url).searchParams.get("phone");
  try {
    if (phone) {
      const { orders } = await listOrders({ query: phone, limit: 100 });
      return Response.json(
        { orders: orders.filter((o) => o.customer.phone === phone) },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }
    return Response.json({ customers: await listCustomers() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[api/admin/customers] failed", err);
    return Response.json({ error: "تعذّر قراءة العملاء." }, { status: 500 });
  }
}
