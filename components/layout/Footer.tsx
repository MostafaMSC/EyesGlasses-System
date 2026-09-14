"use client";

import Link from "next/link";
import { useSettings } from "@/lib/settingsStore";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/layout/StoreLogo";
import {
  IconInstagram,
  IconWhatsApp,
  IconTruck,
  IconMapPin,
  IconChevron,
  IconFacebook,
  IconTikTok,
  IconPhone,
  IconMail,
  IconClock,
} from "@/components/ui/Icons";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function Footer() {
  const { settings } = useSettings();
  const store = settings.store;
  const links = settings.navigation.footer.filter((l) => l.visible).sort((a, b) => a.order - b.order);
  const generalWhatsApp = buildWhatsAppUrl("السلام عليكم، عندي استفسار بخصوص النظارات.");
  const hours = store.workingHours;
  const openDays = hours.filter((h) => !h.closed);
  // Collapse the schedule to one line when every open day has the same times.
  const sameTimes = openDays.length > 0 && openDays.every((h) => h.open === openDays[0].open && h.close === openDays[0].close);
  const closedDays = hours.filter((h) => h.closed).map((h) => DAY_NAMES[h.day]);

  return (
    <footer className="relative overflow-hidden border-t border-line bg-surface">
      <div className="pointer-events-none absolute inset-0">
        <div className="aurora -top-32 right-1/4 h-64 w-64 bg-accent/25" />
      </div>

      <Container className="relative grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <StoreLogo />
            <span className="font-display text-lg font-extrabold text-ink">{store.name}</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-7 text-muted">{store.footerText}</p>
          <div className="mt-4 flex items-center gap-2">
            {store.instagramUrl && <Social href={store.instagramUrl} label="إنستغرام" icon={<IconInstagram className="h-4 w-4" />} />}
            {store.facebookUrl && <Social href={store.facebookUrl} label="فيسبوك" icon={<IconFacebook className="h-4 w-4" />} />}
            {store.tiktokUrl && <Social href={store.tiktokUrl} label="تيك توك" icon={<IconTikTok className="h-4 w-4" />} />}
            <Social href={generalWhatsApp} label="واتساب" icon={<IconWhatsApp className="h-4 w-4" />} />
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-ink">روابط</h3>
          <ul className="flex flex-col gap-3 text-sm text-muted">
            {links.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="group inline-flex items-center gap-1.5 transition hover:text-accent">
                  <IconChevron className="h-3 w-3 rotate-180 opacity-0 transition-all duration-200 group-hover:opacity-100" />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-ink">التواصل</h3>
          <ul className="flex flex-col gap-3 text-sm text-muted">
            <li>
              <a href={generalWhatsApp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-2 text-whatsapp">
                  <IconWhatsApp className="h-4 w-4" />
                </span>
                واتساب
              </a>
            </li>
            {store.phone && (
              <li>
                <a href={`tel:${store.phone}`} className="inline-flex items-center gap-2 transition hover:text-ink" dir="ltr">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent">
                    <IconPhone className="h-4 w-4" />
                  </span>
                  {store.phone}
                </a>
              </li>
            )}
            {store.email && (
              <li>
                <a href={`mailto:${store.email}`} className="inline-flex items-center gap-2 transition hover:text-ink">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent">
                    <IconMail className="h-4 w-4" />
                  </span>
                  {store.email}
                </a>
              </li>
            )}
            {store.instagramUrl && (
              <li>
                <a href={store.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-ink">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent-3">
                    <IconInstagram className="h-4 w-4" />
                  </span>
                  {store.instagramHandle || "إنستغرام"}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-ink">التوصيل وساعات العمل</h3>
          <p className="flex items-center gap-2 text-sm text-muted">
            <IconTruck className="h-4 w-4 shrink-0 text-accent" /> {store.deliveryText}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <IconMapPin className="h-4 w-4 shrink-0 text-accent" />
            {store.mapsUrl ? (
              <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-ink">
                {store.address}
              </a>
            ) : (
              store.address
            )}
          </p>
          {openDays.length > 0 && (
            <div className="mt-3 flex items-start gap-2 text-sm text-muted">
              <IconClock className="mt-1 h-4 w-4 shrink-0 text-accent" />
              <div>
                {sameTimes ? (
                  <p>
                    يومياً <span dir="ltr">{openDays[0].open} – {openDays[0].close}</span>
                    {closedDays.length > 0 && ` (عدا ${closedDays.join("، ")})`}
                  </p>
                ) : (
                  hours.map((h) => (
                    <p key={h.day} className="flex justify-between gap-3">
                      <span>{DAY_NAMES[h.day]}</span>
                      <span dir="ltr">{h.closed ? "مغلق" : `${h.open} – ${h.close}`}</span>
                    </p>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </Container>

      <div className="relative border-t border-line py-5">
        <Container className="flex flex-col items-center gap-2 text-xs text-muted sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {store.name}. جميع الحقوق محفوظة.
          </p>
          <p className="flex items-center gap-3">
            <Link href="/pages/privacy" className="transition hover:text-accent">
              الخصوصية
            </Link>
            <Link href="/pages/terms" className="transition hover:text-accent">
              الشروط
            </Link>
            <Link href="/admin" className="underline transition hover:text-accent">
              لوحة الإدارة
            </Link>
          </p>
        </Container>
      </div>
    </footer>
  );
}

function Social({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-soft transition hover:border-accent/50 hover:text-accent"
    >
      {icon}
    </a>
  );
}
