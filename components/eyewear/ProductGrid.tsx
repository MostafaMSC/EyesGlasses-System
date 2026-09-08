import type { Product } from "@/data/products";
import { ProductCard } from "@/components/eyewear/ProductCard";
import { IconSearch } from "@/components/ui/Icons";

export function ProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-surface/50 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-muted">
          <IconSearch className="h-6 w-6" />
        </span>
        <p className="mt-4 text-lg font-bold text-ink">لا توجد نتائج مطابقة</p>
        <p className="mt-1 text-sm text-muted">جرّب تعديل الفلاتر أو كلمة البحث.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} index={i} />
      ))}
    </div>
  );
}
