"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { canTryOn, discountPercent, type Product } from "@/data/products";
import { formatPrice } from "@/lib/format";
import { availabilityLabel, availabilityTone } from "@/lib/availability";
import { useShopUI } from "@/context/ShopUIContext";
import { useCart } from "@/lib/cartStore";
import { useWishlist } from "@/lib/wishlistStore";
import { ProductVisual } from "@/components/eyewear/ProductVisual";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconCamera, IconCart, IconGlasses, IconHeart, IconStar } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";
import { Stars } from "@/components/product/ProductReviews";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { openTryOn } = useShopUI();
  const cart = useCart();
  const wishlist = useWishlist();
  const href = `/products/${product.slug}`;
  const saved = wishlist.has(product.id);
  const discount = discountPercent(product);
  const soldOut = typeof product.stock === "number" && product.stock <= 0;

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
      <div className="relative">
        <Link href={href} className="relative block overflow-hidden" aria-label={`${product.brand} ${product.name}`}>
          <ProductVisual
            product={product}
            className="aspect-[5/4] rounded-none transition-transform duration-700 group-hover:scale-[1.06]"
          />
        </Link>

        <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {discount > 0 && <Badge tone="danger">خصم {discount}%</Badge>}
          {product.bestseller && (
            <Badge tone="accent" icon={<IconStar className="h-3 w-3" />}>
              الأكثر مبيعاً
            </Badge>
          )}
          {product.isNew && <Badge tone="ink">جديد</Badge>}
        </div>

        <button
          type="button"
          onClick={() => wishlist.toggle(product.id)}
          aria-pressed={saved}
          aria-label={saved ? "إزالة من المفضلة" : "أضف إلى المفضلة"}
          className={cn(
            "absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition active:scale-90",
            saved
              ? "border-danger/40 bg-danger/15 text-danger"
              : "border-line bg-surface/85 text-ink-soft hover:border-accent/40 hover:text-accent"
          )}
        >
          <IconHeart className="h-4 w-4" filled={saved} />
        </button>

        <div className="pointer-events-none absolute bottom-3 left-3">
          <Badge tone={soldOut ? "muted" : availabilityTone[product.availability]}>
            {soldOut ? "نفد المخزون" : availabilityLabel[product.availability]}
          </Badge>
        </div>

        {canTryOn(product) && (
          <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-line bg-surface/85 px-2 py-1 text-[11px] font-bold text-ink-soft backdrop-blur transition-all duration-400 group-hover:border-accent/40 group-hover:text-accent sm:px-2.5">
            <IconGlasses className="h-3.5 w-3.5 text-accent" />
            <span className="hidden sm:inline">تجربة افتراضية</span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{product.brand}</p>
          <Link
            href={href}
            className="mt-0.5 block w-full truncate text-right text-[15px] font-bold text-ink transition-colors hover:text-accent"
          >
            {product.name}
          </Link>
        </div>

        {product.rating && product.rating.count > 0 && (
          <p className="-mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
            <Stars value={product.rating.average} size="h-3 w-3" /> ({product.rating.count})
          </p>
        )}

        <div className="flex items-baseline gap-2">
          <span className="text-base font-extrabold text-ink">{formatPrice(product.price)}</span>
          {discount > 0 && product.compareAtPrice && (
            <span className="text-xs text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          {canTryOn(product) ? (
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              icon={<IconCamera className="h-4 w-4" />}
              onClick={() => openTryOn(product.id)}
            >
              جربها
            </Button>
          ) : (
            <Button href={href} variant="primary" size="sm" className="flex-1">
              التفاصيل
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            icon={<IconCart className="h-4 w-4" />}
            disabled={soldOut}
            onClick={() => {
              cart.add(product.id);
              cart.setOpen(true);
            }}
          >
            أضف للسلة
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
