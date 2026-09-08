"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { storeConfig } from "@/data/storeConfig";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { DesktopNav, DesktopNavFallback, MobileNavLinks } from "@/components/layout/HeaderNav";
import { IconMenu, IconClose, IconGlasses, IconSparkles } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-line bg-bg/80 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl"
          : "border-b border-transparent"
      )}
    >
      <Container className={cn("flex items-center justify-between transition-all duration-300", scrolled ? "h-16" : "h-16 sm:h-20")}>
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-contrast shadow-[0_8px_22px_-10px_var(--accent)] transition-transform duration-300 group-hover:-rotate-6">
            <IconGlasses className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-extrabold text-ink sm:text-xl">{storeConfig.storeName}</span>
        </Link>

        <Suspense fallback={<DesktopNavFallback />}>
          <DesktopNav />
        </Suspense>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden sm:block">
            <Button href="/catalog" variant="primary" size="sm" icon={<IconSparkles className="h-4 w-4" />}>
              تصفح المجموعة
            </Button>
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-2 text-ink transition hover:border-accent/60 hover:text-accent active:scale-95 lg:hidden"
            aria-label="القائمة"
            aria-expanded={open}
          >
            {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-line bg-bg/95 backdrop-blur-xl lg:hidden"
          >
            <Container className="flex flex-col gap-1 py-3">
              <Suspense fallback={null}>
                <MobileNavLinks onNavigate={() => setOpen(false)} />
              </Suspense>
              <Button
                href="/catalog"
                variant="primary"
                size="md"
                className="mt-2"
                onClick={() => setOpen(false)}
              >
                تصفح المجموعة
              </Button>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
