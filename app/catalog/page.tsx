import { Suspense } from "react";
import type { Metadata } from "next";
import { CatalogClient } from "@/components/eyewear/CatalogClient";
import { Container } from "@/components/ui/Container";
import { EyebrowBadge } from "@/components/ui/Badge";
import { IconGrid } from "@/components/ui/Icons";

export const metadata: Metadata = {
  title: "التشكيلة",
  description: "تصفح كل النظارات الشمسية والطبية، صفّ حسب الماركة والشكل واللون والسعر، وجرّبها افتراضياً قبل الطلب.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const params = await searchParams;
  const heading = params.q ? `نتائج البحث عن «${params.q}»` : null;

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
            {heading ?? (
              <>
                تشكيلة <span className="text-gradient">النظارات</span>
              </>
            )}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            نظارات شمسية وطبية أصلية، جربها افتراضياً على وجهك قبل الطلب.
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-muted">جاري التحميل…</p>}>
          <CatalogClient />
        </Suspense>
      </Container>
    </div>
  );
}
