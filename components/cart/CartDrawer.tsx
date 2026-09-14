"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/lib/cartStore";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { formatPrice } from "@/lib/format";
import { CartLineRow } from "@/components/cart/CartLineRow";
import { Button } from "@/components/ui/Button";
import { IconCart, IconClose } from "@/components/ui/Icons";

/** Slide-in cart. Opens when something is added; the full page is /cart. */
export function CartDrawer() {
  const cart = useCart();
  const open = cart.open;
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cart.setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cart]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[65] bg-black/55 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => cart.setOpen(false)}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="سلة التسوق"
            onClick={(e) => e.stopPropagation()}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 left-0 flex w-full max-w-md flex-col border-e border-line bg-bg shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-ink">
                <IconCart className="h-5 w-5 text-accent" /> السلة
                {cart.count > 0 && <span className="text-sm font-bold text-muted">({cart.count})</span>}
              </h2>
              <button
                type="button"
                onClick={() => cart.setOpen(false)}
                aria-label="إغلاق"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-soft transition hover:text-ink active:scale-95"
              >
                <IconClose className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cart.entries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-line bg-surface-2 text-muted">
                    <IconCart className="h-7 w-7" />
                  </span>
                  <p className="mt-4 font-bold text-ink">سلتك فارغة</p>
                  <p className="mt-1 text-sm text-muted">جرّب النظارات على وجهك وأضف ما يعجبك.</p>
                  <Button href="/catalog" variant="primary" size="md" className="mt-5" onClick={() => cart.setOpen(false)}>
                    تصفح التشكيلة
                  </Button>
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {cart.entries.map((e) => (
                    <li key={`${e.productId}|${e.color ?? ""}`} className="py-3">
                      <CartLineRow entry={e} compact onNavigate={() => cart.setOpen(false)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cart.entries.length > 0 && (
              <div className="safe-bottom border-t border-line px-5 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">المجموع الفرعي</span>
                  <span className="font-extrabold text-ink">{formatPrice(cart.subtotal)}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">أجرة التوصيل تُحسب حسب المحافظة في صفحة الطلب.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button href="/cart" variant="secondary" size="md" onClick={() => cart.setOpen(false)}>
                    عرض السلة
                  </Button>
                  <Button href="/checkout" variant="primary" size="md" onClick={() => cart.setOpen(false)}>
                    إتمام الطلب
                  </Button>
                </div>
                <Link
                  href="/catalog"
                  onClick={() => cart.setOpen(false)}
                  className="mt-3 block text-center text-xs font-bold text-accent"
                >
                  متابعة التسوق
                </Link>
              </div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
