import { storeConfig } from "@/data/storeConfig";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { IconInstagram, IconSearch, IconGlasses } from "@/components/ui/Icons";

export function SocialSection() {
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] border border-line bg-surface px-6 py-14 text-center sm:px-16 sm:py-20">
            <div className="pointer-events-none absolute inset-0">
              <div className="grid-lines absolute inset-0 opacity-60" />
              <div className="aurora animate-drift -left-16 -top-16 h-64 w-64 bg-accent/45" />
              <div
                className="aurora animate-drift -bottom-16 -right-16 h-64 w-64 bg-accent-3/45"
                style={{ animationDelay: "-8s" }}
              />
            </div>

            <span className="relative inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/80 px-3.5 py-1.5 text-xs font-bold text-ink-soft backdrop-blur">
              <IconInstagram className="h-3.5 w-3.5 text-accent" /> {storeConfig.instagramHandle}
            </span>

            <h2 className="relative mx-auto mt-6 max-w-xl font-display text-2xl font-extrabold leading-snug text-ink sm:text-4xl">
              شفت نظارة على إنستغرام؟
              <br />
              <span className="text-gradient">جربها هنا قبل ما تطلبها</span>
            </h2>

            <p className="relative mx-auto mt-4 max-w-md text-sm leading-7 text-muted sm:text-base">
              ابحث عن الموديل في التشكيلة، شغّل الكاميرا، وشوف شكلها على وجهك خلال ثوانٍ.
            </p>

            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/catalog" variant="primary" size="lg" icon={<IconSearch className="h-4.5 w-4.5" />}>
                تصفح التشكيلة
              </Button>
              <Button
                href={storeConfig.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="lg"
                icon={<IconGlasses className="h-4.5 w-4.5" />}
              >
                تابعنا على إنستغرام
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
