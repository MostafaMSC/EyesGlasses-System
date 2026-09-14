import { ensureSchema, pool } from "@/lib/db";

/**
 * Storefront analytics. Anonymous counters of what happens to each product
 * — viewed, tried on, added to the cart, bought — so the owner can see which
 * frames draw interest in the try-on and whether that turns into sales.
 */

export const EVENT_TYPES = [
  "product_view",
  "tryon_open",
  "tryon_select",
  "add_to_cart",
  "checkout_start",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export async function recordEvent(type: EventType, productId: string | null, data: unknown): Promise<void> {
  await ensureSchema();
  await pool().query("INSERT INTO events (type, product_id, data) VALUES ($1, $2, $3)", [type, productId, data]);
}

export interface ProductEventCounts {
  productId: string;
  views: number;
  tryOns: number;
  addToCart: number;
}

export async function eventStats(): Promise<{
  totals: Record<string, number>;
  byProduct: ProductEventCounts[];
}> {
  await ensureSchema();
  const p = pool();
  const [totals, byProduct] = await Promise.all([
    p.query<{ type: string; count: string }>(
      "SELECT type, count(*) FROM events WHERE created_at >= now() - interval '90 days' GROUP BY type"
    ),
    p.query<{ product_id: string; views: string; tryons: string; carts: string }>(
      `SELECT product_id,
              count(*) FILTER (WHERE type = 'product_view') AS views,
              count(*) FILTER (WHERE type IN ('tryon_open', 'tryon_select')) AS tryons,
              count(*) FILTER (WHERE type = 'add_to_cart') AS carts
         FROM events
        WHERE product_id IS NOT NULL AND created_at >= now() - interval '90 days'
        GROUP BY product_id ORDER BY tryons DESC, views DESC LIMIT 50`
    ),
  ]);
  const totalMap: Record<string, number> = {};
  for (const r of totals.rows) totalMap[r.type] = Number(r.count);
  return {
    totals: totalMap,
    byProduct: byProduct.rows.map((r) => ({
      productId: r.product_id,
      views: Number(r.views),
      tryOns: Number(r.tryons),
      addToCart: Number(r.carts),
    })),
  };
}
