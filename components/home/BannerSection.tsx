"use client";

import { useState } from "react";
import Link from "next/link";
import { useSettings } from "@/lib/settingsStore";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { IconChevron } from "@/components/ui/Icons";

/** Promotional banners the admin scheduled: active, within their dates, by priority. */
export function BannerSection() {
  const { settings } = useSettings();
  // Sampled once per mount: render must stay pure.
  const [now] = useState(() => Date.now());
  const banners = settings.homepage.banners
    .filter((b) => b.active && b.title)
    .filter((b) => !b.startsAt || new Date(b.startsAt).getTime() <= now)
    .filter((b) => !b.endsAt || new Date(b.endsAt).getTime() >= now)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
  if (banners.length === 0) return null;

  return (
    <section className="pb-14 sm:pb-20">
      <Container>
        <div className={banners.length > 1 ? "grid gap-4 md:grid-cols-2" : ""}>
          {banners.map((b, i) => (
            <Reveal key={b.id} delay={i * 0.08}>
              <Link
                href={b.ctaLink || "/catalog"}
                className="card card-lift ring-gradient group relative block overflow-hidden rounded-[32px]"
              >
                <div className="relative aspect-[16/7] w-full bg-surface-2">
                  {b.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-l from-bg/85 via-bg/40 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-center p-6 sm:p-10">
                    <h3 className="font-display text-xl font-extrabold text-ink sm:text-3xl">{b.title}</h3>
                    {b.description && <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">{b.description}</p>}
                    {b.ctaText && (
                      <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-contrast">
                        {b.ctaText} <IconChevron className="h-3.5 w-3.5 rotate-180" />
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
