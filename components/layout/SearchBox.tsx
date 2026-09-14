"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { isActive, type Product } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { useCategories } from "@/lib/settingsStore";
import { searchProducts } from "@/lib/search";
import { ProductVisual } from "@/components/eyewear/ProductVisual";
import { formatPrice } from "@/lib/format";
import { IconClose, IconSearch } from "@/components/ui/Icons";

/**
 * Site search. The catalogue is a few KB and already in memory, so
 * suggestions come from it directly — no request per keystroke. Enter, or
 * "كل النتائج", goes to the catalogue with the query applied.
 */
export function SearchBox({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { products } = useProductStore();
  const categories = useCategories();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // After the panel has mounted: fresh query, cursor in the box.
    const t = setTimeout(() => {
      setQuery("");
      inputRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim();
  const live = useMemo(() => products.filter(isActive), [products]);
  const results = useMemo(() => (q ? searchProducts(live, q).slice(0, 6) : []), [live, q]);

  // Brand and category names that match: the "Ray" → "Ray-Ban" suggestions.
  const suggestions = useMemo(() => {
    if (!q) return [];
    const lower = q.toLowerCase();
    const brands = Array.from(new Set(live.map((p) => p.brand))).filter((b) => b.toLowerCase().includes(lower));
    const cats = categories.filter((c) => c.name.includes(q) || c.nameEn.toLowerCase().includes(lower));
    return [
      ...brands.slice(0, 4).map((b) => ({ label: b, href: `/catalog?q=${encodeURIComponent(b)}` })),
      ...cats.slice(0, 2).map((c) => ({ label: c.name, href: `/catalog?category=${c.slug}` })),
    ];
  }, [live, categories, q]);

  const submit = () => {
    if (!q) return;
    router.push(`/catalog?q=${encodeURIComponent(q)}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="البحث"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-2xl rounded-[28px] border border-line bg-bg p-3 shadow-[var(--shadow-lg)] sm:mt-6"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex items-center gap-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-accent">
                <IconSearch className="h-5 w-5" />
              </span>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن ماركة، موديل، لون أو شكل…"
                className="field h-11 flex-1"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line text-ink-soft transition hover:text-ink"
              >
                <IconClose className="h-4.5 w-4.5" />
              </button>
            </form>

            {q && (
              <div className="mt-3 max-h-[60vh] overflow-y-auto">
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-1 pb-3">
                    {suggestions.map((s) => (
                      <Link
                        key={s.href + s.label}
                        href={s.href}
                        onClick={onClose}
                        className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-accent/40 hover:text-accent"
                      >
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}

                {results.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {results.map((p) => (
                      <li key={p.id}>
                        <ResultRow product={p} onClick={onClose} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-8 text-center">
                    <p className="text-sm font-bold text-ink">لا توجد نتائج لـ «{q}»</p>
                    <p className="mt-1 text-xs text-muted">جرّب كلمة أخرى، أو تصفح التشكيلة كاملة.</p>
                  </div>
                )}

                {results.length > 0 && (
                  <button
                    type="button"
                    onClick={submit}
                    className="mt-2 w-full rounded-2xl bg-surface-2 py-2.5 text-xs font-bold text-accent transition hover:bg-accent/10"
                  >
                    عرض كل النتائج
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ResultRow({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-2"
    >
      <ProductVisual product={product} className="h-14 w-16 shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold text-accent">{product.brand}</span>
        <span className="block truncate text-sm font-bold text-ink">{product.name}</span>
      </span>
      <span className="text-xs font-bold text-ink-soft">{formatPrice(product.price)}</span>
    </Link>
  );
}
