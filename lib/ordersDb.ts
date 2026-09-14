import { ensureSchema, pool } from "@/lib/db";
import type { Order, OrderStatus } from "@/data/orders";

/**
 * Orders: one JSON document per row, with the columns the admin list
 * filters on (`status`, `phone`, `created_at`) beside it, and the order
 * number generated from a sequence so it is short, unique and sortable.
 */

export async function nextOrderNumber(prefix: string): Promise<string> {
  await ensureSchema();
  const { rows } = await pool().query<{ n: string }>("SELECT nextval('order_number_seq') AS n");
  return `${prefix}-${String(Number(rows[0].n) + 1000).padStart(6, "0")}`;
}

export async function insertOrder(order: Order): Promise<void> {
  await ensureSchema();
  await pool().query(
    "INSERT INTO orders (id, number, status, phone, data) VALUES ($1, $2, $3, $4, $5)",
    [order.id, order.number, order.status, order.customer.phone, order]
  );
}

export async function getOrderById(id: string): Promise<Order | null> {
  await ensureSchema();
  const { rows } = await pool().query<{ data: Order }>("SELECT data FROM orders WHERE id = $1", [id]);
  return rows[0]?.data ?? null;
}

export async function getOrderByNumber(number: string): Promise<Order | null> {
  await ensureSchema();
  const { rows } = await pool().query<{ data: Order }>("SELECT data FROM orders WHERE number = $1", [number]);
  return rows[0]?.data ?? null;
}

export async function updateOrder(order: Order): Promise<void> {
  await ensureSchema();
  await pool().query(
    "UPDATE orders SET data = $2, status = $3, phone = $4, updated_at = now() WHERE id = $1",
    [order.id, order, order.status, order.customer.phone]
  );
}

export interface OrderListFilter {
  status?: OrderStatus;
  /** Matches the order number, customer name or phone. */
  query?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listOrders(filter: OrderListFilter = {}): Promise<{ orders: Order[]; total: number }> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("?", `$${params.length}`));
  };
  if (filter.status) add("status = ?", filter.status);
  if (filter.query) {
    params.push(`%${filter.query}%`);
    const i = params.length;
    where.push(`(number ILIKE $${i} OR phone ILIKE $${i} OR data->'customer'->>'name' ILIKE $${i})`);
  }
  if (filter.from) add("created_at >= ?", filter.from);
  if (filter.to) add("created_at <= ?", filter.to);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const count = await pool().query<{ count: string }>(`SELECT count(*) FROM orders ${whereSql}`, params);
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
  const offset = Math.max(0, filter.offset ?? 0);
  const { rows } = await pool().query<{ data: Order }>(
    `SELECT data FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { orders: rows.map((r) => r.data), total: Number(count.rows[0]?.count ?? 0) };
}

/** Everything the dashboard needs in one round trip. */
export async function orderStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  revenue: number;
  salesByDay: { day: string; orders: number; revenue: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  customers: number;
}> {
  await ensureSchema();
  const p = pool();
  const [byStatus, revenue, byDay, top, customers] = await Promise.all([
    p.query<{ status: string; count: string }>("SELECT status, count(*) FROM orders GROUP BY status"),
    p.query<{ sum: string | null }>(
      "SELECT sum((data->>'total')::numeric) FROM orders WHERE status NOT IN ('cancelled','returned')"
    ),
    p.query<{ day: string; orders: string; revenue: string }>(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*) AS orders,
              coalesce(sum((data->>'total')::numeric), 0) AS revenue
         FROM orders
        WHERE created_at >= now() - interval '30 days' AND status NOT IN ('cancelled','returned')
        GROUP BY day ORDER BY day`
    ),
    p.query<{ product_id: string; name: string; quantity: string; revenue: string }>(
      `SELECT item->>'productId' AS product_id, max(item->>'name') AS name,
              sum((item->>'quantity')::int) AS quantity,
              sum((item->>'quantity')::int * (item->>'unitPrice')::numeric) AS revenue
         FROM orders, jsonb_array_elements(data->'items') AS item
        WHERE status NOT IN ('cancelled','returned')
        GROUP BY product_id ORDER BY quantity DESC LIMIT 10`
    ),
    p.query<{ count: string }>("SELECT count(DISTINCT phone) FROM orders"),
  ]);
  const statusMap: Record<string, number> = {};
  let total = 0;
  for (const r of byStatus.rows) {
    statusMap[r.status] = Number(r.count);
    total += Number(r.count);
  }
  return {
    total,
    byStatus: statusMap,
    revenue: Number(revenue.rows[0]?.sum ?? 0),
    salesByDay: byDay.rows.map((r) => ({ day: r.day, orders: Number(r.orders), revenue: Number(r.revenue) })),
    topProducts: top.rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
    })),
    customers: Number(customers.rows[0]?.count ?? 0),
  };
}

/** Distinct customers seen through orders, for the admin's customer view. */
export async function listCustomers(): Promise<
  { phone: string; name: string; governorate: string; orders: number; spent: number; lastOrderAt: string }[]
> {
  await ensureSchema();
  const { rows } = await pool().query<{
    phone: string;
    name: string;
    governorate: string;
    orders: string;
    spent: string;
    last: string;
  }>(
    `SELECT phone,
            (array_agg(data->'customer'->>'name' ORDER BY created_at DESC))[1] AS name,
            (array_agg(data->'customer'->>'governorate' ORDER BY created_at DESC))[1] AS governorate,
            count(*) AS orders,
            coalesce(sum(CASE WHEN status NOT IN ('cancelled','returned') THEN (data->>'total')::numeric ELSE 0 END), 0) AS spent,
            to_char(max(created_at), 'YYYY-MM-DD"T"HH24:MI:SSZ') AS last
       FROM orders GROUP BY phone ORDER BY max(created_at) DESC LIMIT 500`
  );
  return rows.map((r) => ({
    phone: r.phone,
    name: r.name,
    governorate: r.governorate,
    orders: Number(r.orders),
    spent: Number(r.spent),
    lastOrderAt: r.last,
  }));
}
