import { CatalogClient } from "@/components/eyewear/CatalogClient";
import { Container } from "@/components/ui/Container";
import { EyebrowBadge } from "@/components/ui/Badge";
import { IconGrid } from "@/components/ui/Icons";
import type { Category } from "@/data/products";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const validCategories: (Category | "all")[] = ["all", "sunglasses", "optical"];
  const requested = params.category as Category | "all" | undefined;
  const category = requested && validCategories.includes(requested) ? requested : "all";

  return (
    <div className="relative py-8 sm:py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 overflow-hidden">
        <div className="aurora animate-drift -top-32 right-[10%] h-72 w-72 bg-accent/35" />
        <div
          className="aurora animate-drift -top-24 left-[8%] h-64 w-64 bg-accent-3/30"
          style={{ animationDelay: "-7s" }}
        />
      </div>

      <Container>
        <div className="mb-8">
          <EyebrowBadge icon={<IconGrid className="h-3.5 w-3.5" />}>التشكيلة الكاملة</EyebrowBadge>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-ink sm:text-4xl">
            تشكيلة <span className="text-gradient">النظارات</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            نظارات شمسية وطبية أصلية، جربها افتراضياً على وجهك قبل الطلب.
          </p>
        </div>
        <CatalogClient initialCategory={category} />
      </Container>
    </div>
  );
}
