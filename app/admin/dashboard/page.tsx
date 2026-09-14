"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminCard, AdminShell } from "@/components/admin/AdminShell";
import { orderStatusLabel, type OrderStatus } from "@/data/orders";
import { useProductStore } from "@/lib/productStore";
import { formatPrice } from "@/lib/format";

interface Stats {
  orders: {
    total: number;
    byStatus: Record<string, number>;
    revenue: number;
    salesByDay: { day: string; orders: number; revenue: number }[];
    topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
    customers: number;
  };
  events: {
    totals: Record<string, number>;
    byProduct: { productId: string; views: number; tryOns: number; addToCart: number }[];
  };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { customProducts, hydrated } = useProductStore();

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (Stats & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error ?? "تعذّر قراءة الإحصائيات.");
        setStats(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "تعذّر قراءة الإحصائيات."));
  }, []);

  const lowStock = customProducts.filter((p) => typeof p.stock === "number" && p.stock <= (p.lowStockThreshold ?? 3));
  const purchasedById = new Map(stats?.orders.topProducts.map((t) => [t.productId, t.quantity]) ?? []);
  // Try-on interest without matching sales: worth the owner's attention.
  const interest = (stats?.events.byProduct ?? [])
    .map((e) => ({ ...e, sold: purchasedById.get(e.productId) ?? 0, product: customProducts.find((p) => p.id === e.productId) }))
    .filter((e) => e.product)
    .slice(0, 8);

  return (
    <AdminShell title="اللوحة" subtitle="نظرة سريعة على المبيعات والطلبات وما يجرّبه الزبائن.">
      {error && <p className="mb-6 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-bold text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="إجمالي المبيعات" value={stats ? formatPrice(stats.orders.revenue) : "…"} />
        <Stat label="الطلبات" value={stats ? String(stats.orders.total) : "…"} sub={stats ? `${stats.orders.byStatus.pending ?? 0} بانتظار التأكيد` : undefined} href="/admin/orders" />
        <Stat label="العملاء" value={stats ? String(stats.orders.customers) : "…"} href="/admin/customers" />
        <Stat label="المنتجات" value={hydrated ? String(customProducts.length) : "…"} sub={lowStock.length ? `${lowStock.length} بمخزون منخفض` : undefined} href="/admin" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminCard title="المبيعات — آخر ٣٠ يوماً">
          {stats && stats.orders.salesByDay.length > 0 ? <SalesChart data={stats.orders.salesByDay} /> : <Empty>لا توجد مبيعات في هذه الفترة بعد.</Empty>}
        </AdminCard>

        <AdminCard title="الطلبات حسب الحالة">
          {stats ? (
            <ul className="flex flex-col gap-2">
              {(Object.keys(orderStatusLabel) as OrderStatus[]).map((s) => {
                const n = stats.orders.byStatus[s] ?? 0;
                const pct = stats.orders.total ? Math.round((n / stats.orders.total) * 100) : 0;
                return (
                  <li key={s}>
                    <Link href={`/admin/orders?status=${s}`} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 text-ink-soft">{orderStatusLabel[s]}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-8 text-end font-bold text-ink">{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>…</Empty>
          )}
        </AdminCard>

        <AdminCard title="الأكثر مبيعاً">
          {stats && stats.orders.topProducts.length > 0 ? (
            <Table
              head={["المنتج", "الكمية", "الإيراد"]}
              rows={stats.orders.topProducts.map((t) => [t.name, String(t.quantity), formatPrice(t.revenue)])}
            />
          ) : (
            <Empty>لا توجد مبيعات بعد.</Empty>
          )}
        </AdminCard>

        <AdminCard title="الأكثر تجربةً افتراضياً — آخر ٩٠ يوماً">
          {interest.length > 0 ? (
            <Table
              head={["المنتج", "مشاهدات", "تجارب", "للسلة", "مبيع"]}
              rows={interest.map((e) => [
                `${e.product!.brand} ${e.product!.name}`,
                String(e.views),
                String(e.tryOns),
                String(e.addToCart),
                String(e.sold),
              ])}
            />
          ) : (
            <Empty>ستظهر هنا النظارات التي يجرّبها الزوار أكثر، ومدى تحوّل ذلك إلى مبيعات.</Empty>
          )}
          {stats && (
            <p className="mt-3 text-[11px] text-muted">
              إجمالي: {stats.events.totals.product_view ?? 0} مشاهدة منتج، {(stats.events.totals.tryon_open ?? 0) + (stats.events.totals.tryon_select ?? 0)} تجربة،{" "}
              {stats.events.totals.add_to_cart ?? 0} إضافة للسلة، {stats.events.totals.checkout_start ?? 0} بدء طلب.
            </p>
          )}
        </AdminCard>

        {lowStock.length > 0 && (
          <AdminCard title="مخزون منخفض" className="lg:col-span-2">
            <Table
              head={["المنتج", "الكود", "المخزون", "الحالة"]}
              rows={lowStock.map((p) => [`${p.brand} ${p.name}`, p.sku ?? "—", String(p.stock), p.stock === 0 ? "نفد" : "منخفض"])}
            />
          </AdminCard>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="card h-full rounded-3xl p-4 sm:p-5">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold text-ink sm:text-2xl">{value}</p>
      {sub && <p className="mt-1 text-[11px] font-bold text-accent">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-[11px] font-bold uppercase tracking-wider text-muted">
            {head.map((h) => (
              <th key={h} className="pb-2 pe-3 text-start font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "py-2 pe-3 font-bold text-ink" : "py-2 pe-3 text-ink-soft"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lightweight bar chart: one bar per day, inline SVG, no library. */
function SalesChart({ data }: { data: { day: string; orders: number; revenue: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const w = 100 / data.length;
  return (
    <div>
      <svg viewBox="0 0 100 40" className="h-40 w-full" preserveAspectRatio="none" aria-hidden="true">
        {data.map((d, i) => {
          const h = (d.revenue / max) * 36;
          return <rect key={d.day} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={h} rx={0.8} className="fill-[var(--accent)]" />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-muted">
        <span>{data[0].day.slice(5)}</span>
        <span>{data[data.length - 1].day.slice(5)}</span>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {data.reduce((n, d) => n + d.orders, 0)} طلب — {formatPrice(data.reduce((n, d) => n + d.revenue, 0))}
      </p>
    </div>
  );
}
