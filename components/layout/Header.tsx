"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useSettings } from "@/lib/settingsStore";
import { useCart } from "@/lib/cartStore";
import { useWishlist } from "@/lib/wishlistStore";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { DesktopNav, DesktopNavFallback, MobileNavLinks } from "@/components/layout/HeaderNav";
import { SearchBox } from "@/components/layout/SearchBox";
import { StoreLogo } from "@/components/layout/StoreLogo";
import { IconMenu, IconClose, IconSparkles, IconSearch, IconCart, IconHeart } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

export function Header() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { settings } = useSettings();
  const cart = useCart();
  const wishlist = useWishlist();

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
      <Container className={cn("flex items-center justify-between gap-2 transition-all duration-300", scrolled ? "h-16" : "h-16 sm:h-20")}>
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <StoreLogo />
          <span className="truncate font-display text-lg font-extrabold text-ink sm:text-xl">{settings.store.name}</span>
        </Link>

        <Suspense fallback={<DesktopNavFallback />}>
          <DesktopNav />
        </Suspense>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <IconButton label="البحث" onClick={() => setSearchOpen(true)}>
            <IconSearch className="h-[18px] w-[18px]" />
          </IconButton>
          <Link
            href="/wishlist"
            aria-label="المفضلة"
            className="relative hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-soft transition hover:border-accent/60 hover:text-accent active:scale-95 sm:flex"
          >
            <IconHeart className="h-[18px] w-[18px]" />
            {wishlist.ids.length > 0 && <Count n={wishlist.ids.length} />}
          </Link>
          <IconButton label="السلة" onClick={() => cart.setOpen(true)}>
            <IconCart className="h-[18px] w-[18px]" />
            {cart.count > 0 && <Count n={cart.count} />}
          </IconButton>
          <ThemeToggle />
          <div className="hidden lg:block">
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
              <Link
                href="/wishlist"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink sm:hidden"
              >
                <IconHeart className="h-4 w-4" /> المفضلة {wishlist.ids.length > 0 && `(${wishlist.ids.length})`}
              </Link>
              <Link
                href="/track"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3.5 py-3 text-sm font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink"
              >
                تتبع طلبك
              </Link>
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

      <SearchBox open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-soft transition hover:border-accent/60 hover:text-accent active:scale-95"
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-contrast ring-2 ring-bg">
      {n > 99 ? "99+" : n}
    </span>
  );
}
