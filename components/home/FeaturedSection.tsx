"use client";

import { useProductStore } from "@/lib/productStore";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/components/eyewear/ProductGrid";
import { IconChevron, IconStar } from "@/components/ui/Icons";

export function FeaturedSection() {
  const { products } = useProductStore();
  const featured = products.filter((p) => p.featured || p.bestseller).slice(0, 8);

  return (
    <section className="py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="مختارات المتجر"
          eyebrowIcon={<IconStar className="h-3.5 w-3.5" />}
          title="الأكثر مبيعاً"
          subtitle="الإطارات التي يختارها زبائننا أكثر من غيرها — جرّب أي واحدة منها على وجهك مباشرة."
          action={
            <Button
              href="/catalog"
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
