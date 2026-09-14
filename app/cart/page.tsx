"use client";

import Link from "next/link";
import { useCart } from "@/lib/cartStore";
import { useSettings } from "@/lib/settingsStore";
import { formatPrice } from "@/lib/format";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { CartLineRow } from "@/components/cart/CartLineRow";
import { IconCart, IconTruck } from "@/components/ui/Icons";

export default function CartPage() {
  const cart = useCart();
  const { settings } = useSettings();
  const free = settings.commerce.freeDeliveryThreshold;
  const remaining = free > 0 ? Math.max(0, free - cart.subtotal) : 0;

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">سلة التسوق</h1>

        {cart.entries.length === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/50 py-20 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-line bg-surface-2 text-muted">
              <IconCart className="h-7 w-7" />
            </span>
            <p className="mt-4 text-lg font-bold text-ink">سلتك فارغة</p>
            <p className="mt-1 text-sm text-muted">جرّب النظارات على وجهك وأضف ما يعجبك.</p>
            <Button href="/catalog" variant="primary" size="md" className="mt-6">
              تصفح التشكيلة
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
            <ul className="card flex flex-col divide-y divide-line rounded-3xl px-5">
              {cart.entries.map((e) => (
                <li key={`${e.productId}|${e.color ?? ""}`} className="py-4">
                  <CartLineRow entry={e} />
                </li>
              ))}
            </ul>

            <aside className="card h-fit rounded-3xl p-5 lg:sticky lg:top-24">
              <h2 className="font-display text-lg font-bold text-ink">ملخص الطلب</h2>
              <dl className="mt-4 flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">المنتجات ({cart.count})</dt>
                  <dd className="font-bold text-ink">{formatPrice(cart.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">التوصيل</dt>
                  <dd className="text-xs text-muted">يُحدد حسب المحافظة</dd>
                </div>
              </dl>
              {free > 0 && (
                <p className="mt-3 flex items-center gap-2 rounded-2xl bg-accent/10 px-3 py-2 text-xs font-bold text-accent">
                  <IconTruck className="h-4 w-4 shrink-0" />
                  {remaining > 0 ? `أضف ${formatPrice(remaining)} لتحصل على توصيل مجاني` : "التوصيل مجاني لهذا الطلب 🎉"}
                </p>
              )}
              <Button href="/checkout" variant="primary" size="lg" className="mt-5 w-full">
                إتمام الطلب
              </Button>
              <Link href="/catalog" className="mt-3 block text-center text-xs font-bold text-accent">
                متابعة التسوق
              </Link>
            </aside>
          </div>
        )}
      </Container>
    </div>
  );
}
