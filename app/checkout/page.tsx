"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Order, OrderRequest } from "@/data/orders";
import { useCart } from "@/lib/cartStore";
import { useSettings } from "@/lib/settingsStore";
import { formatPrice } from "@/lib/format";
import { track } from "@/lib/analytics";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ProductVisual } from "@/components/eyewear/ProductVisual";
import { IconCheck } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

const CUSTOMER_KEY = "abu-thar-customer";

interface CustomerForm {
  name: string;
  phone: string;
  governorate: string;
  city: string;
  address: string;
  notes: string;
}

const EMPTY: CustomerForm = { name: "", phone: "", governorate: "", city: "", address: "", notes: "" };

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const { settings } = useSettings();
  const commerce = settings.commerce;
  const zones = useMemo(() => commerce.zones.filter((z) => z.active), [commerce.zones]);
  const methods = useMemo(() => commerce.paymentMethods.filter((m) => m.active), [commerce.paymentMethods]);

  const [form, setForm] = useState<CustomerForm>(EMPTY);
  const [chosenPayment, setPaymentId] = useState("");
  const paymentId = chosenPayment || methods[0]?.id || "";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  // Remember who the customer is between orders, on this device only.
  useEffect(() => {
    // After paint: localStorage isn't there during server rendering.
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? "null") as Partial<CustomerForm> | null;
        if (saved) setForm({ ...EMPTY, ...saved, notes: "" });
      } catch {
        // ignore
      }
      setRestored(true);
    });
    track("checkout_start");
  }, []);

  const zone = zones.find((z) => z.name === form.governorate);
  const freeDelivery = commerce.freeDeliveryThreshold > 0 && cart.subtotal >= commerce.freeDeliveryThreshold;
  const deliveryFee = zone ? (freeDelivery ? 0 : zone.fee) : null;
  const discount = coupon ? Math.min(coupon.discount, cart.subtotal) : 0;
  const total = cart.subtotal - discount + (deliveryFee ?? 0);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone: form.phone, items: cart.entries.map((e) => ({ productId: e.productId, quantity: e.quantity })) }),
      });
      const data = (await res.json().catch(() => null)) as { code?: string; discount?: number; error?: string } | null;
      if (!res.ok || !data?.code) throw new Error(data?.error ?? "الكوبون غير صالح.");
      setCoupon({ code: data.code, discount: data.discount ?? 0 });
    } catch (err) {
      setCoupon(null);
      setCouponError(err instanceof Error ? err.message : "الكوبون غير صالح.");
    } finally {
      setCouponBusy(false);
    }
  };
  const belowMin = commerce.minOrderAmount > 0 && cart.subtotal < commerce.minOrderAmount;
  const method = methods.find((m) => m.id === paymentId);

  const set = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (cart.entries.length === 0) return setError("السلة فارغة.");
    if (!zone) return setError("اختر المحافظة.");
    if (!method) return setError("اختر طريقة الدفع.");
    setBusy(true);
    try {
      const body: OrderRequest = {
        customer: form,
        items: cart.entries.map((e) => ({ productId: e.productId, quantity: e.quantity, color: e.color })),
        paymentMethodId: method.id,
        couponCode: coupon?.code,
      };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { order?: Order; error?: string } | null;
      if (!res.ok || !data?.order) throw new Error(data?.error ?? "تعذّر إرسال الطلب.");
      try {
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ ...form, notes: "" }));
        sessionStorage.setItem(`order:${data.order.number}`, JSON.stringify(data.order));
      } catch {
        // ignore
      }
      cart.clear();
      router.push(`/orders/${data.order.number}?phone=${encodeURIComponent(data.order.customer.phone)}&new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال الطلب.");
      setBusy(false);
    }
  };

  if (restored && cart.entries.length === 0 && !busy) {
    return (
      <div className="py-16">
        <Container>
          <div className="mx-auto max-w-md rounded-3xl border border-dashed border-line bg-surface/50 py-16 text-center">
            <p className="text-lg font-bold text-ink">سلتك فارغة</p>
            <p className="mt-1 text-sm text-muted">أضف نظارة أولاً ثم أكمل الطلب.</p>
            <Button href="/catalog" variant="primary" size="md" className="mt-6">
              تصفح التشكيلة
            </Button>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">إتمام الطلب</h1>
        <p className="mt-1 text-sm text-muted">املأ بياناتك وسنتواصل معك لتأكيد الطلب.</p>

        <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            <section className="card rounded-3xl p-5 sm:p-6">
              <h2 className="mb-4 font-display text-lg font-bold text-ink">بيانات التوصيل</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="الاسم الكامل *">
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} autoComplete="name" className="field" />
                </Field>
                <Field label="رقم الهاتف *">
                  <input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="07xx xxx xxxx"
                    className="field text-left"
                  />
                </Field>
                <Field label="المحافظة *">
                  <select value={form.governorate} onChange={(e) => set("governorate", e.target.value)} required className="field">
                    <option value="">اختر المحافظة</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.name}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="المدينة / المنطقة">
                  {zone && zone.areas.length > 0 ? (
                    <select value={form.city} onChange={(e) => set("city", e.target.value)} className="field">
                      <option value="">اختر المنطقة</option>
                      {zone.areas.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={form.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" className="field" />
                  )}
                </Field>
                <Field label="العنوان بالتفصيل *" className="sm:col-span-2">
                  <input
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    required
                    minLength={4}
                    autoComplete="street-address"
                    placeholder="الحي، الشارع، أقرب نقطة دالة"
                    className="field"
                  />
                </Field>
                <Field label="ملاحظات (اختياري)" className="sm:col-span-2">
                  <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="field" />
                </Field>
              </div>
            </section>

            <section className="card rounded-3xl p-5 sm:p-6">
              <h2 className="mb-4 font-display text-lg font-bold text-ink">طريقة الدفع</h2>
              <div className="flex flex-col gap-2.5">
                {methods.map((m) => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition",
                      paymentId === m.id ? "border-accent bg-accent/8" : "border-line hover:border-accent/40"
                    )}
                  >
                    <input type="radio" name="payment" value={m.id} checked={paymentId === m.id} onChange={() => setPaymentId(m.id)} className="mt-1 accent-[var(--accent)]" />
                    <span>
                      <span className="block text-sm font-bold text-ink">{m.label}</span>
                      {m.description && <span className="block text-xs leading-5 text-muted">{m.description}</span>}
                    </span>
                  </label>
                ))}
                {methods.length === 0 && <p className="text-sm text-danger">لا توجد طرق دفع مفعّلة حالياً.</p>}
              </div>
            </section>
          </div>

          <aside className="card h-fit rounded-3xl p-5 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-bold text-ink">ملخص الطلب</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {cart.entries.map((e) => (
                <li key={`${e.productId}|${e.color ?? ""}`} className="flex items-center gap-3">
                  <ProductVisual product={e.product} className="h-14 w-16 shrink-0 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {e.product.brand} {e.product.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {e.quantity} × {formatPrice(e.product.price)}
                      {e.color ? ` · ${e.color}` : ""}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-ink">{formatPrice(e.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-line pt-4">
              {coupon ? (
                <p className="flex items-center justify-between rounded-2xl bg-success/10 px-3 py-2 text-xs font-bold text-success">
                  <span>كوبون {coupon.code} مطبّق</span>
                  <button type="button" onClick={() => { setCoupon(null); setCouponInput(""); }} className="underline">
                    إزالة
                  </button>
                </p>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="رمز الكوبون"
                    dir="ltr"
                    className="field flex-1 text-left"
                  />
                  <Button type="button" variant="secondary" size="md" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}>
                    تطبيق
                  </Button>
                </div>
              )}
              {couponError && <p className="mt-2 text-xs font-bold text-danger">{couponError}</p>}
            </div>
            <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">المجموع الفرعي</dt>
                <dd className="font-bold text-ink">{formatPrice(cart.subtotal)}</dd>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>الخصم</dt>
                  <dd className="font-bold">- {formatPrice(discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">التوصيل{zone ? ` (${zone.name})` : ""}</dt>
                <dd className="font-bold text-ink">
                  {deliveryFee === null ? <span className="text-xs text-muted">اختر المحافظة</span> : deliveryFee === 0 ? "مجاني" : formatPrice(deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base">
                <dt className="font-bold text-ink">الإجمالي</dt>
                <dd className="font-extrabold text-ink">{formatPrice(total)}</dd>
              </div>
            </dl>
            {belowMin && (
              <p className="mt-3 rounded-2xl bg-danger/10 px-3 py-2 text-xs font-bold text-danger">
                الحد الأدنى للطلب {formatPrice(commerce.minOrderAmount)}.
              </p>
            )}
            {error && <p className="mt-3 rounded-2xl bg-danger/10 px-3 py-2 text-xs font-bold text-danger">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={busy || belowMin || methods.length === 0} icon={<IconCheck className="h-5 w-5" />}>
              {busy ? "جاري إرسال الطلب…" : "تأكيد الطلب"}
            </Button>
            <p className="mt-3 text-center text-[11px] leading-5 text-muted">
              بتأكيد الطلب أنت توافق على{" "}
              <Link href="/pages/terms" className="font-bold text-accent">
                الشروط والأحكام
              </Link>
              .
            </p>
          </aside>
        </form>
      </Container>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
