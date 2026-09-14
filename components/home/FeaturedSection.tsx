"use client";

import { isActive } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { useSettings } from "@/lib/settingsStore";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/components/eyewear/ProductGrid";
import { IconChevron, IconSparkles, IconStar } from "@/components/ui/Icons";

/** "Featured" — the admin's picks, or the featured/bestseller flags. */
export function FeaturedSection() {
  const { products } = useProductStore();
  const { settings } = useSettings();
  const section = settings.homepage.featured;
  if (!section.active) return null;

  const live = products.filter(isActive);
  const picked = section.productIds.length
    ? section.productIds.map((id) => live.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
    : live.filter((p) => p.featured || p.bestseller);
  const featured = (picked.length ? picked : live).slice(0, 8);
  if (featured.length === 0) return null;

  return (
    <section className="py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="مختارات المتجر"
          eyebrowIcon={<IconStar className="h-3.5 w-3.5" />}
          title={section.title}
          subtitle={section.subtitle}
          action={
            <Button
              href="/catalog?sort=bestselling"
              variant="secondary"
              size="sm"
              icon={<IconChevron className="h-4 w-4 rotate-180" />}
              iconPosition="end"
            >
              كل المنتجات
            </Button>
          }
        />
        <ProductGrid products={featured} />
      </Container>
    </section>
  );
}

/** Newest products, by the flag or by the date they were added. */
export function NewArrivalsSection() {
  const { products } = useProductStore();
  const { settings } = useSettings();
  const section = settings.homepage.newArrivals;
  if (!section.active) return null;

  const live = products.filter(isActive);
  const flagged = live.filter((p) => p.isNew);
  const list = (flagged.length ? flagged : [...live].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))).slice(0, 4);
  if (list.length < 2) return null;

  return (
    <section className="pb-14 sm:pb-20">
      <Container>
        <SectionHeading
          eyebrow="جديدنا"
          eyebrowIcon={<IconSparkles className="h-3.5 w-3.5" />}
          title={section.title}
          subtitle={section.subtitle}
          action={
            <Button
              href="/catalog?sort=newest"
              variant="secondary"
              size="sm"
              icon={<IconChevron className="h-4 w-4 rotate-180" />}
              iconPosition="end"
            >
              كل الجديد
            </Button>
          }
        />
        <ProductGrid products={list} />
      </Container>
    </section>
  );
}
