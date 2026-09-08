"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useProductFilters } from "@/lib/useProductFilters";
import { ProductFilters } from "@/components/eyewear/ProductFilters";
import { ProductGrid } from "@/components/eyewear/ProductGrid";
import { Button } from "@/components/ui/Button";
import { IconChevron, IconSliders } from "@/components/ui/Icons";
import type { Category } from "@/data/products";

export function CatalogClient({ initialCategory }: { initialCategory?: Category | "all" }) {
  const filters = useProductFilters({ category: initialCategory });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterProps = {
    search: filters.search,
    onSearchChange: filters.setSearch,
    category: filters.category,
    onCategoryChange: filters.setCategory,
    brands: filters.brands,
    selectedBrands: filters.selectedBrands,
    onToggleBrand: filters.toggleBrand,
    sort: filters.sort,
    onSortChange: filters.setSort,
    maxPrice: filters.maxPrice,
    priceCeiling: filters.priceCeiling,
    onMaxPriceChange: filters.setMaxPrice,
    resultCount: filters.filtered.length,
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[290px_1fr]">
      <aside className="hidden lg:block">
        <div className="card sticky top-24 rounded-3xl p-5">
          <h2 className="mb-5 flex items-center gap-2 font-display text-lg font-bold text-ink">
            <IconSliders className="h-4.5 w-4.5 text-accent" />
            تصفية النتائج
          </h2>
          <ProductFilters {...filterProps} />
        </div>
      </aside>

      <div>
        <div className="mb-4 lg:hidden">
          <Button
            variant="secondary"
            size="md"
            className="w-full justify-between"
            onClick={() => setFiltersOpen((v) => !v)}
            icon={<IconSliders className="h-4 w-4" />}
          >
            <span className="flex-1 text-start">تصفية وترتيب ({filters.filtered.length})</span>
            <IconChevron
              className={`h-4 w-4 transition-transform duration-300 ${filtersOpen ? "-rotate-90" : "rotate-90"}`}
            />
          </Button>

          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="card mt-3 rounded-3xl p-4">
                  <ProductFilters {...filterProps} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ProductGrid products={filters.filtered} />
      </div>
    </div>
  );
}
