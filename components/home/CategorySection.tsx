"use client";

import Link from "next/link";
import { isActive } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { useCategories } from "@/lib/settingsStore";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { ProductVisual } from "@/components/eyewear/ProductVisual";
import { IconChevron } from "@/components/ui/Icons";

/** Shop-by-category tiles: the category's own picture, or its first product's. */
export function CategorySection() {
  const categories = useCategories();
  const { products } = useProductStore();
  const live = products.filter(isActive);
  const tiles = categories
    .map((c) => ({ category: c, count: live.filter((p) => p.category === c.slug).length, sample: live.find((p) => p.category === c.slug) }))
    .filter((t) => t.count > 0);
  if (tiles.length < 2) return null;

  return (
    <section className="pb-14 sm:pb-20">
      <Container>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {tiles.map(({ category, count, sample }, i) => (
            <Reveal key={category.slug} delay={i * 0.06}>
              <Link
                href={`/catalog?category=${category.slug}`}
                className="card card-lift ring-gradient group relative block overflow-hidden rounded-3xl"
              >
                {category.image ? (
                  <div className="aspect-[5/4] w-full overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={category.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
                  </div>
                ) : sample ? (
                  <ProductVisual product={sample} className="aspect-[5/4] rounded-none transition-transform duration-700 group-hover:scale-[1.05]" />
                ) : (
                  <div className="aspect-[5/4] w-full bg-surface-2" />
                )}
                <div className="flex items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{category.name}</p>
                    <p className="text-[11px] text-muted">{count} منتج</p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition group-hover:border-accent/50 group-hover:text-accent">
                    <IconChevron className="h-3.5 w-3.5 rotate-180" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
