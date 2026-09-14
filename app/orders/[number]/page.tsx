"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ORDER_PROGRESS, orderStatusLabel, orderStatusTone, paymentStatusLabel, type Order } from "@/data/orders";
import { formatDate, formatPrice } from "@/lib/format";
import { buildOrderWhatsAppMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IconCheck, IconWhatsApp, IconPackage } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

/**
 * Order confirmation and tracking. Reached right after checkout (with
 * `?new=1`) and from the tracking form. Needs the phone the order was
 * placed with — carried in the URL from checkout, typed on /track.
 */
export default function OrderPage() {
  const { number } = useParams<{ number: string }>();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const isNew = params.get("new") === "1";
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Right after checkout the order is already in hand — no round trip.
    queueMicrotask(() => {
      try {
        const cached = sessionStorage.getItem(`order:${number}`);
        if (cached) setOrder((o) => o ?? (JSON.parse(cached) as Order));
      } catch {
        // ignore
      }
    });
    fetch(`/api/orders/track?number=${encodeURIComponent(number)}&phone=${encodeURIComponent(phone)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { order?: Order; error?: string } | null;
        if (!res.ok || !body?.order) throw new Error(body?.error ?? "تعذّر العثور على الطلب.");
        setOrder(body.order);
      })
      .catch((err) => setOrder((o) => (o ? o : (setError(err instanceof Error ? err.message : "تعذّر العثور على الطلب."), null))));
  }, [number, phone]);

  if (error && !order) {
    return (
      <div className="py-16">
        <Container>
          <div className="mx-auto max-w-md rounded-3xl border border-line bg-surface p-8 text-center">
            <p className="font-bold text-ink">{error}</p>
            <Button href="/track" variant="secondary" size="md" className="mt-5">
              تتبع طلب آخر
            </Button>
          </div>
        </Container>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="py-16">
        <Container>
          <p className="text-center text-sm text-muted">جاري تحميل الطلب…</p>
        </Container>
      </div>
    );
  }

  const cancelled = order.status === "cancelled" || order.status === "returned";
  const step = ORDER_PROGRESS.indexOf(order.status);
  const whatsapp = buildWhatsAppUrl(buildOrderWhatsAppMessage(order));

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <div className="mx-auto max-w-3xl">
          {isNew ? (
            <div className="rounded-[32px] border border-success/30 bg-success/10 p-6 text-center sm:p-10">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
                <IconCheck className="h-8 w-8" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-extrabold text-ink sm:text-3xl">تم استلام طلبك</h1>
              <p className="mt-2 text-sm text-ink-soft">
                رقم الطلب <span className="font-extrabold text-ink" dir="ltr">{order.number}</span>
              </p>
              <p className="mt-1 text-sm text-muted">سنتواصل معك على {order.customer.phone} لتأكيد الطلب.</p>
              {order.payment.instructions && (
                <p className="mx-auto mt-4 max-w-md whitespace-pre-line rounded-2xl bg-surface px-4 py-3 text-sm leading-7 text-ink">
                  {order.payment.instructions}
                </p>
              )}
              <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
                <Button href={whatsapp} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="md" icon={<IconWhatsApp className="h-4.5 w-4.5" />}>
                  أرسل الطلب على واتساب
                </Button>
                <Button href="/catalog" variant="secondary" size="md">
                  متابعة التسوق
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">
                  الطلب <span dir="ltr">{order.number}</span>
                </h1>
                <p className="mt-1 text-sm text-muted">{formatDate(order.createdAt)}</p>
              </div>
              <Badge tone={orderStatusTone[order.status]}>{orderStatusLabel[order.status]}</Badge>
            </div>
          )}

          {/* Progress */}
          <div className="card mt-6 rounded-3xl p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-ink">
              <IconPackage className="h-5 w-5 text-accent" /> حالة الطلب
            </h2>
            {cancelled ? (
              <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-bold text-danger">{orderStatusLabel[order.status]}</p>
            ) : (
              <ol className="grid grid-cols-5 gap-1">
                {ORDER_PROGRESS.map((s, i) => (
                  <li key={s} className="flex flex-col items-center text-center">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold",
                        i <= step ? "bg-accent text-accent-contrast" : "border border-line bg-surface-2 text-muted"
                      )}
                    >
                      {i < step ? <IconCheck className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={cn("mt-1.5 text-[10px] font-bold leading-4 sm:text-xs", i <= step ? "text-ink" : "text-muted")}>
                      {orderStatusLabel[s]}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {order.history.length > 1 && (
              <ul className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-xs text-muted">
                {[...order.history].reverse().map((h, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="font-bold text-ink-soft">{orderStatusLabel[h.status]}</span>
                    <span>{new Date(h.at).toLocaleString("ar-IQ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_280px]">
            <div className="card rounded-3xl p-5">
              <h2 className="mb-3 font-display text-base font-bold text-ink">المنتجات</h2>
              <ul className="flex flex-col divide-y divide-line">
                {order.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.image} alt="" className="h-14 w-16 shrink-0 rounded-xl bg-surface-2 object-contain p-1" />
                    <span className="min-w-0 flex-1">
                      <Link href={`/products/${it.slug}`} className="block truncate text-sm font-bold text-ink hover:text-accent">
                        {it.brand} {it.name}
                      </Link>
                      <span className="block text-[11px] text-muted">
                        {it.quantity} × {formatPrice(it.unitPrice)}
                        {it.color ? ` · ${it.color}` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-ink">{formatPrice(it.unitPrice * it.quantity)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
                <Row label="المجموع الفرعي" value={formatPrice(order.subtotal)} />
                {order.discount > 0 && <Row label="الخصم" value={`- ${formatPrice(order.discount)}`} />}
                <Row label="التوصيل" value={order.deliveryFee === 0 ? "مجاني" : formatPrice(order.deliveryFee)} />
                <Row label="الإجمالي" value={formatPrice(order.total)} strong />
              </dl>
            </div>

            <div className="card rounded-3xl p-5 text-sm">
              <h2 className="mb-3 font-display text-base font-bold text-ink">التوصيل والدفع</h2>
              <p className="font-bold text-ink">{order.customer.name}</p>
              <p className="text-muted" dir="ltr">
                {order.customer.phone}
              </p>
              <p className="mt-2 text-ink-soft">
                {order.customer.governorate}
                {order.customer.city ? ` – ${order.customer.city}` : ""}
              </p>
              <p className="text-ink-soft">{order.customer.address}</p>
              {order.customer.notes && <p className="mt-2 text-xs text-muted">ملاحظات: {order.customer.notes}</p>}
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-ink-soft">{order.payment.label}</p>
                <p className="text-xs text-muted">{paymentStatusLabel[order.paymentStatus]}</p>
              </div>
              {!isNew && (
                <Button href={whatsapp} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="sm" className="mt-4 w-full" icon={<IconWhatsApp className="h-4 w-4" />}>
                  تواصل بخصوص الطلب
                </Button>
              )}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t border-line pt-2 text-base")}>
      <dt className={strong ? "font-bold text-ink" : "text-muted"}>{label}</dt>
      <dd className={strong ? "font-extrabold text-ink" : "font-bold text-ink"}>{value}</dd>
    </div>
  );
}
