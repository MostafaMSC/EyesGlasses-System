import { recordEvent, EVENT_TYPES, type EventType } from "@/lib/eventsDb";

export const dynamic = "force-dynamic";

/**
 * Storefront analytics beacon: which products get viewed, tried on, added
 * to the cart. Anonymous — no identifier of the visitor is stored.
 */
export async function POST(request: Request) {
  let body: { type?: unknown; productId?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof body.type !== "string" || !(EVENT_TYPES as readonly string[]).includes(body.type)) {
    return new Response(null, { status: 400 });
  }
  const productId = typeof body.productId === "string" ? body.productId.slice(0, 64) : null;
  const data = body.data && typeof body.data === "object" ? body.data : null;
  recordEvent(body.type as EventType, productId, data).catch((err) => console.error("[api/events] failed", err));
  return new Response(null, { status: 204 });
}
