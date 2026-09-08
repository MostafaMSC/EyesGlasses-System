import { storeConfig } from "@/data/storeConfig";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { IconTruck, IconGem, IconCamera, IconWhatsApp } from "@/components/ui/Icons";

const icons = [IconTruck, IconGem, IconCamera, IconWhatsApp];

export function TrustSection() {
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {storeConfig.trustPoints.map((point, i) => {
            const Icon = icons[i % icons.length];
            return (
              <Reveal key={point} delay={i * 0.07}>
                <div className="card card-lift ring-gradient group relative h-full overflow-hidden rounded-3xl p-6 text-center">
                  {/* Accent wash that fades in behind the icon on hover. */}
                  <div className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-accent/12 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                  <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-accent transition-all duration-400 group-hover:-translate-y-1 group-hover:border-accent/40 group-hover:bg-accent/10">
                    <Icon className="h-6 w-6" />
                  </span>
                  <p className="relative mt-4 text-sm font-bold leading-6 text-ink">{point}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
