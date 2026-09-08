"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export const navLinks = [
  { href: "/", label: "الرئيسية" },
  { href: "/catalog", label: "التشكيلة" },
  { href: "/catalog?category=sunglasses", label: "النظارات الشمسية" },
  { href: "/catalog?category=optical", label: "النظارات الطبية" },
];

/**
 * Split out of Header because `useSearchParams` forces its subtree to be
 * client-rendered — keeping it here means the rest of the header (logo, theme
 * toggle, CTA) still ships in the prerendered HTML.
 */
export function DesktopNav() {
  const active = useActiveHref();

  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {navLinks.map((link) => {
        const isActive = active === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200",
              isActive ? "text-accent" : "text-ink-soft hover:text-ink"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded-full border border-accent/25 bg-accent/10"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopNavFallback() {
  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:text-ink"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const active = useActiveHref();

  return (
    <>
      {navLinks.map((link, i) => (
        <motion.div
          key={link.href}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.04 * i, duration: 0.3 }}
        >
          <Link
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "block rounded-xl px-3.5 py-3 text-sm font-semibold transition",
              active === link.href
                ? "bg-accent/10 text-accent"
                : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            )}
          >
            {link.label}
          </Link>
        </motion.div>
      ))}
    </>
  );
}

function useActiveHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  return category ? `${pathname}?category=${category}` : pathname;
}
