"use client";

import type { ReactNode } from "react";
import { useSettings } from "@/lib/settingsStore";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import {
  IconTruck,
  IconGem,
  IconCamera,
  IconWhatsApp,
  IconShieldCheck,
  IconRefresh,
  IconStar,
  IconHeart,
  IconPackage,
  IconClock,
} from "@/components/ui/Icons";

/** Icons the admin can pick for a trust badge, by name. */
export const trustIcons: Record<string, (props: { className?: string }) => ReactNode> = {
  truck: (p) => <IconTruck {...p} />,
  gem: (p) => <IconGem {...p} />,
  camera: (p) => <IconCamera {...p} />,
  whatsapp: (p) => <IconWhatsApp {...p} />,
  shield: (p) => <IconShieldCheck {...p} />,
  refresh: (p) => <IconRefresh {...p} />,
  star: (p) => <IconStar {...p} />,
  heart: (p) => <IconHeart {...p} />,
  package: (p) => <IconPackage {...p} />,
  clock: (p) => <IconClock {...p} />,
};

export const trustIconLabel: Record<string, string> = {
  truck: "توصيل",
  gem: "أصلي",
  camera: "تجربة افتراضية",
  whatsapp: "واتساب",
  shield: "ضمان",
  refresh: "استبدال",
  star: "تقييم",
  heart: "مفضلة",
  package: "طرد",
  clock: "وقت",
};

export function TrustSection() {
  const { settings } = useSettings();
  const badges = settings.homepage.trust.filter((b) => b.active).sort((a, b) => a.order - b.order);
  if (badges.length === 0) return null;

  return (
    <section className="py-14 sm:py-20">
      <Container>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {badges.map((badge, i) => {
            const Icon = trustIcons[badge.icon] ?? trustIcons.gem;
            return (
              <Reveal key={badge.id} delay={i * 0.07}>
                <div className="card card-lift ring-gradient group relative h-full overflow-hidden rounded-3xl p-6 text-center">
                  {/* Accent wash that fades in behind the icon on hover. */}
                  <div className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-accent/12 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                  <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-accent transition-all duration-400 group-hover:-translate-y-1 group-hover:border-accent/40 group-hover:bg-accent/10">
                    {Icon({ className: "h-6 w-6" })}
                  </span>
                  <p className="relative mt-4 text-sm font-bold leading-6 text-ink">{badge.title}</p>
                  {badge.description && <p className="relative mt-1 text-xs leading-5 text-muted">{badge.description}</p>}
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
