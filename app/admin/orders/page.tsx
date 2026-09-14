"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminCard, AdminField, adminInput, AdminMessage, AdminShell } from "@/components/admin/AdminShell";
import {
  ORDER_STATUSES,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  type Order,
  type OrderStatus,
  type PaymentStatus,
} from "@/data/orders";
import { formatPrice } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconClose, IconSearch, IconWhatsApp } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

export default function AdminOrdersPage() {
  return (
    <AdminShell title="الطلبات" subtitle="كل الطلبات الواردة من المتجر. اضغط على طلب لتغيير حالته أو إضافة ملاحظة.">
      <Suspense fallback={null}>
        <OrdersView />
      </Suspense>
    </AdminShell>
  );
}

function OrdersView() {
  const params = useSearchParams();
  const [status, setStatus] = useState<string>(params.get("status") ?? "");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      if (query.trim()) q.set("q", query.trim());
      const res = await fetch(`/api/orders?${q}`);
      const body = (await res.json().catch(() => null)) as { orders?: Order[]; total?: number; error?: string } | null;
      if (!res.ok || !body?.orders) throw new Error(body?.error ?? "تعذّر قراءة الطلبات.");
      setOrders(body.orders);
      setTotal(body.total ?? body.orders.length);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "تعذّر قراءة الطلبات." });
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const onUpdated = (order: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
    setSelected(order);
  };

  return (
    <>
      <AdminMessage message={message} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="رقم الطلب، الاسم أو الهاتف…"
            className={`${adminInput} rounded-full ps-10`}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${adminInput} w-auto rounded-full`}>
          <option value="">كل الحالات</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel[s]}
            </option>
          ))}
        </select>
        <span className="text-xs font-bold text-muted">{total} طلب</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <AdminCard>
          {loading && orders.length === 0 ? (
            <p className="text-sm text-muted">جاري التحميل…</p>
          ) : orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">لا توجد طلبات مطابقة.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {orders.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(o)}
                    className={cn("flex w-full flex-wrap items-center gap-3 py-3 text-start transition hover:bg-surface-2/60", selected?.id === o.id && "bg-accent/6")}
                  >
                    <span className="w-24 shrink-0 font-bold text-ink" dir="ltr">
                      {o.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{o.customer.name}</span>
                      <span className="block text-[11px] text-muted">
                        {o.customer.governorate} · {new Date(o.createdAt).toLocaleDateString("ar-IQ")} · {o.items.reduce((n, i) => n + i.quantity, 0)} قطعة
                      </span>
                    </span>
                    <span className="text-sm font-extrabold text-ink">{formatPrice(o.total)}</span>
                    <Badge tone={orderStatusTone[o.status]}>{orderStatusLabel[o.status]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <div className="lg:sticky lg:top-24 lg:self-start">
          {selected ? (
            <OrderDetail order={selected} onClose={() => setSelected(null)} onUpdated={onUpdated} onMessage={setMessage} />
          ) : (
            <AdminCard>
              <p className="py-10 text-center text-sm text-muted">اختر طلباً لعرض تفاصيله.</p>
            </AdminCard>
          )}
        </div>
      </div>
    </>
  );
}

function OrderDetail({
  order,
  onClose,
  onUpdated,
  onMessage,
}: {
  order: Order;
  onClose: () => void;
  onUpdated: (o: Order) => void;
  onMessage: (m: { kind: "ok" | "warn" | "error"; text: string }) => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(order.paymentStatus);
  const [notes, setNotes] = useState(order.adminNotes);
  const [busy, setBusy] = useState(false);

  // A different order selected: show its values.
  useEffect(() => {
    queueMicrotask(() => {
      setStatus(order.status);
      setPaymentStatus(order.paymentStatus);
      setNotes(order.adminNotes);
    });
  }, [order]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paymentStatus, adminNotes: notes }),
      });
      const body = (await res.json().catch(() => null)) as { order?: Order; error?: string } | null;
      if (!res.ok || !body?.order) throw new Error(body?.error ?? "تعذّر الحفظ.");
      onUpdated(body.order);
      onMessage({ kind: "ok", text: `تم تحديث الطلب ${order.number}.` });
    } catch (err) {
      onMessage({ kind: "error", text: err instanceof Error ? err.message : "تعذّر الحفظ." });
    } finally {
      setBusy(false);
    }
  };

  const whatsapp = buildWhatsAppUrl(`السلام عليكم ${order.customer.name}، بخصوص طلبك رقم ${order.number} من المتجر:`).replace(
    /^https:\/\/wa\.me\/[0-9]+/,
    `https://wa.me/${toIntl(order.customer.phone)}`
  );

  return (
    <AdminCard
      title={order.number}
      actions={
        <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted">
          <IconClose className="h-4 w-4" />
        </button>
      }
    >
      <p className="text-xs text-muted">{new Date(order.createdAt).toLocaleString("ar-IQ")}</p>

      <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-sm">
        <p className="font-bold text-ink">{order.customer.name}</p>
        <p dir="ltr" className="text-ink-soft">
          {order.customer.phone}
        </p>
        <p className="mt-1 text-ink-soft">
          {order.customer.governorate}
          {order.customer.city ? ` – ${order.customer.city}` : ""}
        </p>
        <p className="text-ink-soft">{order.customer.address}</p>
        {order.customer.notes && <p className="mt-1 text-xs text-muted">ملاحظة الزبون: {order.customer.notes}</p>}
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-whatsapp">
          <IconWhatsApp className="h-3.5 w-3.5" /> مراسلة الزبون
        </a>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
        {order.items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.image} alt="" className="h-10 w-12 rounded-lg bg-surface-2 object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-ink">
                {it.brand} {it.name}
              </span>
              <span className="block text-[11px] text-muted">
                {it.quantity} × {formatPrice(it.unitPrice)}
                {it.color ? ` · ${it.color}` : ""}
                {it.sku ? ` · ${it.sku}` : ""}
              </span>
            </span>
            <span className="font-bold text-ink">{formatPrice(it.unitPrice * it.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">المجموع الفرعي</dt>
          <dd>{formatPrice(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">التوصيل</dt>
          <dd>{formatPrice(order.deliveryFee)}</dd>
        </div>
        <div className="flex justify-between text-sm font-extrabold text-ink">
          <dt>الإجمالي</dt>
          <dd>{formatPrice(order.total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">الدفع</dt>
          <dd>{order.payment.label}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3">
        <AdminField label="حالة الطلب">
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={adminInput}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel[s]}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="حالة الدفع">
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)} className={adminInput}>
            {(Object.keys(paymentStatusLabel) as PaymentStatus[]).map((s) => (
              <option key={s} value={s}>
                {paymentStatusLabel[s]}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="ملاحظات داخلية (لا يراها الزبون)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={adminInput} />
        </AdminField>
        <Button variant="primary" size="md" onClick={save} disabled={busy}>
          {busy ? "جاري الحفظ…" : "حفظ"}
        </Button>
      </div>

      {order.history.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-[11px] text-muted">
          {[...order.history].reverse().map((h, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="font-bold text-ink-soft">{orderStatusLabel[h.status]}</span>
              <span>{new Date(h.at).toLocaleString("ar-IQ")}</span>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}

/** Iraqi local numbers (07xx…) to international, for wa.me links. */
function toIntl(phone: string): string {
  return phone.startsWith("0") ? `964${phone.slice(1)}` : phone;
}
