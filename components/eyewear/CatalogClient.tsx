"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { sortOptions, useProductFilters } from "@/lib/useProductFilters";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { ProductFilters } from "@/components/eyewear/ProductFilters";
import { ProductGrid } from "@/components/eyewear/ProductGrid";
import { Button } from "@/components/ui/Button";
import { IconClose, IconSliders, IconSort } from "@/components/ui/Icons";

const PAGE_SIZE = 12;

export function CatalogClient() {
  const filters = useProductFilters();
  const [sheetOpen, setSheetOpen] = useState(false);
  useBodyScrollLock(sheetOpen);

  // "Show more" count, tied to the result set it was pressed for: a change
  // of filters goes back to the first page on its own.
  const resultKey = filters.filtered.map((p) => p.id).join(",");
  const [paging, setPaging] = useState({ key: resultKey, shown: PAGE_SIZE });
  const shown = paging.key === resultKey ? paging.shown : PAGE_SIZE;
  const setShown = (next: (n: number) => number) => setPaging({ key: resultKey, shown: next(shown) });

  const visible = filters.filtered.slice(0, shown);

  const sortSelect = (
    <div className="relative">
      <IconSort className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      <select
        value={filters.state.sort}
        onChange={(e) => filters.setSort(e.target.value as typeof filters.state.sort)}
        aria-label="ترتيب النتائج"
        className="field w-auto cursor-pointer rounded-full py-2 pe-8 ps-9 text-xs font-semibold"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[290px_1fr]">
      <aside className="hidden lg:block">
        <div className="card sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-3xl p-5">
          <h2 className="mb-5 flex items-center gap-2 font-display text-lg font-bold text-ink">
            <IconSliders className="h-4.5 w-4.5 text-accent" />
            تصفية النتائج
          </h2>
          <ProductFilters filters={filters} />
        </div>
      </aside>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted">
            <span className="text-ink">{filters.filtered.length}</span> منتج
            {filters.state.search && (
              <>
                {" "}
                لـ «<span className="text-ink">{filters.state.search}</span>»
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            {sortSelect}
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setSheetOpen(true)}
              icon={<IconSliders className="h-4 w-4" />}
            >
              تصفية{filters.activeCount > 0 && ` (${filters.activeCount})`}
            </Button>
          </div>
        </div>

        <ProductGrid products={visible} />

        {shown < filters.filtered.length && (
          <div className="mt-8 flex justify-center">
            <Button variant="secondary" size="md" onClick={() => setShown((n) => n + PAGE_SIZE)}>
              عرض المزيد ({filters.filtered.length - shown})
            </Button>
          </div>
        )}
      </div>

      {/* Bottom sheet — phones and tablets. */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="تصفية النتائج"
              onClick={(e) => e.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[32px] border-t border-line bg-bg shadow-[var(--shadow-lg)]"
            >
              <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-line" />
              <div className="flex items-center justify-between px-5 pb-3 pt-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                  <IconSliders className="h-4.5 w-4.5 text-accent" /> تصفية النتائج
                </h2>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="إغلاق"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-soft"
                >
                  <IconClose className="h-4.5 w-4.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-4">
                <ProductFilters filters={filters} showSearch={false} />
              </div>
              <div className="safe-bottom border-t border-line px-5 py-3">
                <Button variant="primary" size="lg" className="w-full" onClick={() => setSheetOpen(false)}>
                  عرض {filters.filtered.length} منتج
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
