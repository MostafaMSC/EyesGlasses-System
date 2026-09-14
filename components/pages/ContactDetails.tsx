"use client";

import { useSettings } from "@/lib/settingsStore";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { Button } from "@/components/ui/Button";
import { IconWhatsApp, IconPhone, IconMail, IconMapPin, IconClock, IconInstagram } from "@/components/ui/Icons";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Contact block for the about/contact pages, from the store settings. */
export function ContactDetails() {
  const { settings } = useSettings();
  const s = settings.store;
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="card rounded-3xl p-6">
        <h2 className="font-display text-lg font-bold text-ink">تواصل معنا</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-soft">
          <li className="flex items-center gap-2">
            <IconWhatsApp className="h-4 w-4 text-whatsapp" /> واتساب: <span dir="ltr">+{s.whatsappNumber}</span>
          </li>
          {s.phone && (
            <li className="flex items-center gap-2">
              <IconPhone className="h-4 w-4 text-accent" /> <span dir="ltr">{s.phone}</span>
            </li>
          )}
          {s.email && (
            <li className="flex items-center gap-2">
              <IconMail className="h-4 w-4 text-accent" /> {s.email}
            </li>
          )}
          {s.instagramUrl && (
            <li className="flex items-center gap-2">
              <IconInstagram className="h-4 w-4 text-accent-3" />
              <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                {s.instagramHandle || "إنستغرام"}
              </a>
            </li>
          )}
          <li className="flex items-center gap-2">
            <IconMapPin className="h-4 w-4 text-accent" />
            {s.mapsUrl ? (
              <a href={s.mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                {s.address}
              </a>
            ) : (
              s.address
            )}
          </li>
        </ul>
        <Button
          href={buildWhatsAppUrl("السلام عليكم، عندي استفسار.")}
          target="_blank"
          rel="noopener noreferrer"
          variant="whatsapp"
          size="md"
          className="mt-5 w-full"
          icon={<IconWhatsApp className="h-4.5 w-4.5" />}
        >
          راسلنا على واتساب
        </Button>
      </div>
      <div className="card rounded-3xl p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <IconClock className="h-5 w-5 text-accent" /> ساعات العمل
        </h2>
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {s.workingHours.map((h) => (
            <li key={h.day} className="flex justify-between border-b border-line pb-2 last:border-b-0">
              <span className="text-ink-soft">{DAY_NAMES[h.day]}</span>
              <span className="font-bold text-ink" dir="ltr">
                {h.closed ? "مغلق" : `${h.open} – ${h.close}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
