"use client";

import { motion } from "framer-motion";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";
import { availabilityLabel, availabilityTone } from "@/lib/availability";
import { useShopUI } from "@/context/ShopUIContext";
import { ProductVisual } from "@/components/eyewear/ProductVisual";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconCamera, IconGlasses, IconStar } from "@/components/ui/Icons";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { openDetails, openTryOn } = useShopUI();

  return (
    <motion.article
      // Animates on mount rather than on scroll: a scroll-reveal that fails to
      // trigger would leave products permanently invisible, which is far worse
      // than showing them a beat early.
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.04, 0.28), ease: [0.16, 1, 0.3, 1] }}
      className="card card-lift ring-gradient group flex h-full flex-col overflow-hidden rounded-3xl"
    >
      <button
        type="button"
        onClick={() => openDetails(product.id)}
        className="relative block overflow-hidden text-right"
        aria-label={`${product.brand} ${product.name}`}
      >
        <ProductVisual
          product={product}
          className="aspect-[5/4] rounded-none transition-transform duration-700 group-hover:scale-[1.06]"
        />

        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {product.bestseller && (
            <Badge tone="accent" icon={<IconStar className="h-3 w-3" />}>
              الأكثر مبيعاً
            </Badge>
          )}
          {product.isNew && <Badge tone="ink">جديد</Badge>}
        </div>

        <div className="absolute left-3 top-3">
          <Badge tone={availabilityTone[product.availability]}>{availabilityLabel[product.availability]}</Badge>
        </div>

        {/* Slides up out of the image edge on hover; always visible on touch. */}
        <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-line bg-surface/85 px-2.5 py-1 text-[11px] font-bold text-ink-soft backdrop-blur transition-all duration-400 group-hover:border-accent/40 group-hover:text-accent">
          <IconGlasses className="h-3.5 w-3.5 text-accent" />
          تجربة افتراضية
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{product.brand}</p>
          <button
            type="button"
            onClick={() => openDetails(product.id)}
            className="mt-0.5 block w-full truncate text-right text-[15px] font-bold text-ink transition-colors hover:text-accent"
          >
            {product.name}
          </button>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-base font-extrabold text-ink">{formatPrice(product.price)}</span>
          {product.compareAtPrice && (
            <span className="text-xs text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            icon={<IconCamera className="h-4 w-4" />}
            onClick={() => openTryOn(product.id)}
          >
            جربها
          </Button>
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => openDetails(product.id)}>
            التفاصيل
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
