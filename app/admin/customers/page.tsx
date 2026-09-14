"use client";

import { useEffect, useState } from "react";
import { AdminCard, adminInput, AdminShell } from "@/components/admin/AdminShell";
import { orderStatusLabel, orderStatusTone, type Order } from "@/data/orders";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { IconClose, IconSearch } from "@/components/ui/Icons";

interface Customer {
  phone: string;
  name: string;
  governorate: string;
  orders: number;
  spent: number;
  lastOrderAt: string;
}

/** Customers as the orders reveal them — no accounts yet, so the phone is the key. */
export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelectedState] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const setSelected = (c: Customer | null) => {
    setSelectedState(c);
    setOrders(null);
  };

  useEffect(() => {
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((b: { customers?: Customer[] }) => setCustomers(b.customers ?? []))
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetch(`/api/admin/customers?phone=${encodeURIComponent(selected.phone)}`)
      .then((r) => r.json())
      .then((b: { orders?: Order[] }) => !cancelled && setOrders(b.orders ?? []))
      .catch(() => !cancelled && setOrders([]));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const q = query.trim();
  const list = (customers ?? []).filter((c) => !q || c.name.includes(q) || c.phone.includes(q) || c.governorate.includes(q));

  return (
    <AdminShell title="العملاء" subtitle="كل من طلب من المتجر، مع عدد طلباته ومجموع مشترياته.">
      <div className="relative mb-4 max-w-md">
        <IconSearch className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="الاسم أو الهاتف أو المحافظة…" className={`${adminInput} rounded-full ps-10`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <AdminCard>
          {customers === null ? (
            <p className="text-sm text-muted">جاري التحميل…</p>
          ) : list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">لا يوجد عملاء بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    <th className="pb-2 pe-3 text-start">الاسم</th>
                    <th className="pb-2 pe-3 text-start">الهاتف</th>
                    <th className="pb-2 pe-3 text-start">المحافظة</th>
                    <th className="pb-2 pe-3 text-start">طلبات</th>
                    <th className="pb-2 pe-3 text-start">المشتريات</th>
                    <th className="pb-2 text-start">آخر طلب</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.phone} onClick={() => setSelected(c)} className="cursor-pointer border-t border-line transition hover:bg-surface-2/60">
                      <td className="py-2.5 pe-3 font-bold text-ink">{c.name}</td>
                      <td className="py-2.5 pe-3 text-ink-soft" dir="ltr">
                        {c.phone}
                      </td>
                      <td className="py-2.5 pe-3 text-ink-soft">{c.governorate}</td>
                      <td className="py-2.5 pe-3 text-ink-soft">{c.orders}</td>
                      <td className="py-2.5 pe-3 font-bold text-ink">{formatPrice(c.spent)}</td>
                      <td className="py-2.5 text-ink-soft">{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("ar-IQ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <div className="lg:sticky lg:top-24 lg:self-start">
          {selected ? (
            <AdminCard
              title={selected.name}
              actions={
                <button type="button" onClick={() => setSelected(null)} aria-label="إغلاق" className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted">
                  <IconClose className="h-4 w-4" />
                </button>
              }
            >
              <p className="text-sm text-ink-soft" dir="ltr">
                {selected.phone}
              </p>
              <p className="text-xs text-muted">
                {selected.orders} طلب · {formatPrice(selected.spent)}
              </p>
              <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">سجل الطلبات</h3>
              {orders === null ? (
                <p className="mt-2 text-sm text-muted">…</p>
              ) : (
                <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
                  {orders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        <span className="block font-bold text-ink" dir="ltr">
                          {o.number}
                        </span>
                        <span className="block text-[11px] text-muted">{new Date(o.createdAt).toLocaleDateString("ar-IQ")}</span>
                      </span>
                      <span className="font-bold text-ink">{formatPrice(o.total)}</span>
                      <Badge tone={orderStatusTone[o.status]}>{orderStatusLabel[o.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          ) : (
            <AdminCard>
              <p className="py-10 text-center text-sm text-muted">اختر عميلاً لعرض طلباته.</p>
            </AdminCard>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
