/**
 * Fire-and-forget storefront analytics. `sendBeacon` where available, so a
 * tap that navigates away still gets counted, and never anything that can
 * throw into the caller. Anonymous: only the event type and product id.
 */
export type TrackedEvent = "product_view" | "tryon_open" | "tryon_select" | "add_to_cart" | "checkout_start";

const recent = new Map<string, number>();

export function track(type: TrackedEvent, productId?: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  // The same view twice within a few seconds (re-render, back/forward) is one.
  const key = `${type}:${productId ?? ""}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 5000) return;
  recent.set(key, now);

  const body = JSON.stringify({ type, productId, data });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(
        () => {}
      );
    }
  } catch {
    // Analytics must never break the page.
  }
}
