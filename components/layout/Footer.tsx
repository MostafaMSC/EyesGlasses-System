import Link from "next/link";
import { storeConfig } from "@/data/storeConfig";
import { Container } from "@/components/ui/Container";
import {
  IconGlasses,
  IconInstagram,
  IconWhatsApp,
  IconTruck,
  IconMapPin,
  IconChevron,
} from "@/components/ui/Icons";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const browseLinks = [
  { href: "/catalog", label: "كل التشكيلة" },
  { href: "/catalog?category=sunglasses", label: "النظارات الشمسية" },
  { href: "/catalog?category=optical", label: "النظارات الطبية" },
];

export function Footer() {
  const generalWhatsApp = buildWhatsAppUrl("السلام عليكم، عندي استفسار بخصوص النظارات.");

  return (
    <footer className="relative overflow-hidden border-t border-line bg-surface">
      <div className="pointer-events-none absolute inset-0">
        <div className="aurora -top-32 right-1/4 h-64 w-64 bg-accent/25" />
      </div>

      <Container className="relative grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-contrast">
              <IconGlasses className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-extrabold text-ink">{storeConfig.storeName}</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-7 text-muted">
            نظارات أصلية بأسلوب فاخر، مع تجربة افتراضية تخليك تشوف شكل النظارة عليك قبل ما تطلبها.
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-ink">تصفح</h3>
          <ul className="flex flex-col gap-3 text-sm text-muted">
            {browseLinks.map((l) => (
              <li key={l.href}>
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
              <a
                href={generalWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-ink"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-2 text-whatsapp">
                  <IconWhatsApp className="h-4 w-4" />
                </span>
                واتساب
              </a>
            </li>
            <li>
              <a
                href={storeConfig.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-ink"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent-3">
                  <IconInstagram className="h-4 w-4" />
                </span>
                {storeConfig.instagramHandle}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-ink">التوصيل</h3>
          <p className="flex items-center gap-2 text-sm text-muted">
            <IconTruck className="h-4 w-4 shrink-0 text-accent" /> {storeConfig.deliveryText}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <IconMapPin className="h-4 w-4 shrink-0 text-accent" /> {storeConfig.location}
          </p>
        </div>
      </Container>

      <div className="relative border-t border-line py-5">
        <Container className="flex flex-col items-center gap-2 text-xs text-muted sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {storeConfig.storeName}. جميع الحقوق محفوظة.
          </p>
          <p className="flex items-center gap-3">
            <span>عرض تجريبي (MVP) لمنصة النظارات الرقمية.</span>
            <Link href="/admin" className="underline transition hover:text-accent">
              إدارة النظارات
            </Link>
          </p>
        </Container>
      </div>
    </footer>
  );
}
