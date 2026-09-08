"use client";

import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { IconSearch, IconClose, IconSort, IconTag, IconSliders, IconGrid } from "@/components/ui/Icons";
import type { Category } from "@/data/products";
import type { SortOption } from "@/lib/useProductFilters";

const categoryOptions: { value: Category | "all"; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "sunglasses", label: "نظارات شمسية" },
  { value: "optical", label: "نظارات طبية" },
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popular", label: "الأكثر شعبية" },
  { value: "price_asc", label: "السعر: من الأقل للأعلى" },
  { value: "price_desc", label: "السعر: من الأعلى للأقل" },
  { value: "newest", label: "الأحدث" },
];

interface ProductFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: Category | "all";
  onCategoryChange: (value: Category | "all") => void;
  brands: string[];
  selectedBrands: string[];
  onToggleBrand: (brand: string) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  maxPrice: number;
  priceCeiling: number;
  onMaxPriceChange: (value: number) => void;
  resultCount: number;
}

export function ProductFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  brands,
  selectedBrands,
  onToggleBrand,
  sort,
  onSortChange,
  maxPrice,
  priceCeiling,
  onMaxPriceChange,
  resultCount,
}: ProductFiltersProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ابحث عن ماركة أو موديل..."
          className="field rounded-full py-3 pe-11 ps-11"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="مسح البحث"
            className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted transition hover:bg-surface-3 hover:text-ink"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <FilterGroup label="النوع" icon={<IconGrid className="h-3.5 w-3.5" />}>
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onCategoryChange(opt.value)}
              aria-pressed={category === opt.value}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition duration-200 active:scale-95",
                category === opt.value
                  ? "bg-gradient-to-l from-accent to-accent-2 text-accent-contrast shadow-[0_8px_22px_-12px_var(--accent)]"
                  : "border border-line bg-surface-2 text-ink-soft hover:border-accent/40 hover:text-ink"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="الماركة" icon={<IconTag className="h-3.5 w-3.5" />}>
        <div className="flex flex-wrap items-center gap-2">
          {brands.map((brand) => {
            const active = selectedBrands.includes(brand);
            return (
              <button
                key={brand}
                onClick={() => onToggleBrand(brand)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wide transition duration-200 active:scale-95",
                  active
                    ? "border-accent/50 bg-accent/12 text-accent"
                    : "border-line text-ink-soft hover:border-accent/40 hover:text-ink"
                )}
              >
                {brand}
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup label="السعر الأقصى" icon={<IconSliders className="h-3.5 w-3.5" />}>
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="mb-3 flex items-center justify-between text-sm font-semibold text-ink-soft">
            <span>حتى</span>
            <span className="rounded-full bg-accent/12 px-2.5 py-1 text-xs font-bold text-accent">
              {formatPrice(maxPrice)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={priceCeiling}
            step={5000}
            value={maxPrice}
            onChange={(e) => onMaxPriceChange(Number(e.target.value))}
            aria-label="السعر الأقصى"
            className="w-full"
          />
        </div>
      </FilterGroup>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm font-semibold text-muted">
          <span className="text-ink">{resultCount}</span> منتج
        </p>
        <div className="relative">
          <IconSort className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
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
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}
