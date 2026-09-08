"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getRelatedProducts } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { formatPrice } from "@/lib/format";
import { availabilityLabel, availabilityTone } from "@/lib/availability";
import { openWhatsAppOrder } from "@/lib/whatsapp";
import { useShopUI } from "@/context/ShopUIContext";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { ProductVisual } from "@/components/eyewear/ProductVisual";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconClose, IconWhatsApp, IconGlasses, IconStar, IconPalette } from "@/components/ui/Icons";

export function ProductDetailsModal() {
  const { detailsProductId, closeDetails, openTryOn } = useShopUI();
  const { getById } = useProductStore();
  const product = detailsProductId ? getById(detailsProductId) : undefined;
  const isOpen = Boolean(product);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetails();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeDetails]);

  const related = product ? getRelatedProducts(product) : [];

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeDetails}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[32px] border border-line bg-bg shadow-[var(--shadow-lg)] sm:rounded-[32px]"
          >
            <button
              onClick={closeDetails}
              className="sticky top-4 z-20 float-left ms-4 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface/90 text-ink backdrop-blur transition hover:border-accent/50 hover:text-accent active:scale-95"
              aria-label="إغلاق"
            >
              <IconClose className="h-4.5 w-4.5" />
            </button>

            <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-8">
              <ProductVisual product={product} className="aspect-square" priority />

              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-accent">{product.brand}</p>
                  <h2 className="mt-1 font-display text-2xl font-extrabold text-ink">{product.name}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {product.bestseller && (
                    <Badge tone="accent" icon={<IconStar className="h-3 w-3" />}>
                      الأكثر مبيعاً
                    </Badge>
                  )}
                  {product.isNew && <Badge tone="ink">جديد</Badge>}
                  <Badge tone={availabilityTone[product.availability]}>
                    {availabilityLabel[product.availability]}
                  </Badge>
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-extrabold text-ink">{formatPrice(product.price)}</span>
                  {product.compareAtPrice && (
                    <span className="text-sm text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
                  )}
                </div>

                <p className="text-sm leading-7 text-ink-soft">{product.description}</p>

                {product.colors.length > 0 && (
                  <div>
                    <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                      <IconPalette className="h-3.5 w-3.5" /> الألوان المتوفرة
                    </p>
                    <div className="flex items-center gap-2.5">
                      {product.colors.map((c) => (
                        <span
                          key={c.name}
                          title={c.name}
                          className="h-8 w-8 rounded-full ring-2 ring-line ring-offset-2 ring-offset-bg transition hover:ring-accent"
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
                  <Button
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    icon={<IconGlasses className="h-5 w-5" />}
                    onClick={() => openTryOn(product.id)}
                  >
                    جربها على وجهك
                  </Button>
                  <Button
                    variant="whatsapp"
                    size="lg"
                    className="flex-1"
                    icon={<IconWhatsApp className="h-5 w-5" />}
                    onClick={() => openWhatsAppOrder(product)}
                  >
                    اطلب عبر واتساب
                  </Button>
                </div>
              </div>
            </div>

            {related.length > 0 && (
              <div className="border-t border-line p-5 sm:p-8">
                <h3 className="mb-4 font-display text-lg font-bold text-ink">قد تعجبك أيضاً</h3>
                <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-1">
                  {related.map((r) => (
                    <div key={r.id} className="w-40 shrink-0">
                      <RelatedCard productId={r.id} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RelatedCard({ productId }: { productId: string }) {
  const { openDetails } = useShopUI();
  const { getById } = useProductStore();
  const product = getById(productId);
  if (!product) return null;

  return (
    <button
      type="button"
      onClick={() => openDetails(product.id)}
      className="group flex w-full flex-col gap-2 rounded-2xl text-right transition"
    >
      <ProductVisual
        product={product}
        className="aspect-square ring-1 ring-line transition duration-300 group-hover:ring-accent/50"
      />
      <span className="block truncate text-[11px] font-bold text-accent">{product.brand}</span>
      <span className="-mt-1.5 block truncate text-sm font-semibold text-ink">{product.name}</span>
      <span className="-mt-1.5 block text-xs text-muted">{formatPrice(product.price)}</span>
    </button>
  );
}
