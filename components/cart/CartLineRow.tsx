"use client";

import Link from "next/link";
import { MAX_QTY, useCart, type CartEntry } from "@/lib/cartStore";
import { formatPrice } from "@/lib/format";
import { ProductVisual } from "@/components/eyewear/ProductVisual";
import { IconMinus, IconPlus, IconTrash } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

/** One cart line: picture, name, quantity stepper, line total. */
export function CartLineRow({
  entry,
  compact = false,
  onNavigate,
}: {
  entry: CartEntry;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const cart = useCart();
  const { product, quantity, color } = entry;
  const stockCap = typeof product.stock === "number" ? Math.max(0, product.stock) : MAX_QTY;
  const max = Math.min(MAX_QTY, stockCap || MAX_QTY);

  return (
    <div className="flex gap-3">
      <Link href={`/products/${product.slug}`} onClick={onNavigate} className="shrink-0">
        <ProductVisual product={product} className={cn("rounded-2xl", compact ? "h-20 w-24" : "h-24 w-28 sm:h-28 sm:w-32")} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-accent">{product.brand}</p>
            <Link
              href={`/products/${product.slug}`}
              onClick={onNavigate}
              className="block truncate text-sm font-bold text-ink hover:text-accent"
            >
              {product.name}
            </Link>
            {color && <p className="text-[11px] text-muted">اللون: {color}</p>}
          </div>
          <button
            type="button"
            onClick={() => cart.remove(product.id, color)}
            aria-label="حذف"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center rounded-full border border-line bg-surface-2">
            <button
              type="button"
              onClick={() => cart.setQuantity(product.id, quantity - 1, color)}
              aria-label="أقل"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:text-ink active:scale-90"
            >
              <IconMinus className="h-4 w-4" />
            </button>
            <span className="w-7 text-center text-sm font-extrabold text-ink" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => cart.setQuantity(product.id, quantity + 1, color)}
              disabled={quantity >= max}
              aria-label="أكثر"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:text-ink active:scale-90 disabled:opacity-40"
            >
              <IconPlus className="h-4 w-4" />
            </button>
          </div>
          <span className="text-sm font-extrabold text-ink">{formatPrice(entry.lineTotal)}</span>
        </div>
      </div>
    </div>
  );
}
