import { requireAdmin } from "@/lib/adminAuth";
import { orderStats } from "@/lib/ordersDb";
import { eventStats } from "@/lib/eventsDb";

export const dynamic = "force-dynamic";

/** Dashboard numbers: orders, revenue, top products, try-on interest. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const [orders, events] = await Promise.all([orderStats(), eventStats()]);
    return Response.json({ orders, events }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[api/admin/stats] failed", err);
    return Response.json({ error: "تعذّر قراءة الإحصائيات." }, { status: 500 });
  }
}
