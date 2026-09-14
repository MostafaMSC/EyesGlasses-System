"use client";

import { isActive, type Product } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { useWishlist } from "@/lib/wishlistStore";
import { useCart } from "@/lib/cartStore";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ProductGrid } from "@/components/eyewear/ProductGrid";
import { IconHeart } from "@/components/ui/Icons";

export default function WishlistPage() {
  const wishlist = useWishlist();
  const cart = useCart();
  const { products, hydrated } = useProductStore();
  const saved = wishlist.ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p) && isActive(p as Product));

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">المفضلة</h1>
            <p className="mt-1 text-sm text-muted">النظارات التي حفظتها لتعود إليها لاحقاً.</p>
          </div>
          {saved.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                for (const p of saved) cart.add(p.id);
                cart.setOpen(true);
              }}
            >
              أضف الكل إلى السلة
            </Button>
          )}
        </div>
        {hydrated && saved.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/50 py-20 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-line bg-surface-2 text-muted">
              <IconHeart className="h-7 w-7" />
            </span>
            <p className="mt-4 text-lg font-bold text-ink">لا توجد منتجات محفوظة</p>
            <p className="mt-1 text-sm text-muted">اضغط على القلب في أي نظارة لحفظها هنا.</p>
            <Button href="/catalog" variant="primary" size="md" className="mt-6">
              تصفح التشكيلة
            </Button>
          </div>
        ) : (
          <ProductGrid products={saved} />
        )}
      </Container>
    </div>
  );
}
