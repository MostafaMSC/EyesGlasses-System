"use client";

import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { genderLabel, materialLabel, sizeLabel, type FrameMaterial, type FrameSize, type Gender } from "@/data/products";
import { frameShapeLabel, type FrameShape } from "@/lib/frameShapes";
import { useCategories } from "@/lib/settingsStore";
import { IconSearch, IconClose, IconTag, IconSliders, IconGrid, IconPalette, IconGlasses, IconRuler } from "@/components/ui/Icons";
import type { ProductFilterApi } from "@/lib/useProductFilters";

/** The filter panel: rendered in the sidebar on desktop, a bottom sheet on phones. */
export function ProductFilters({ filters, showSearch = true }: { filters: ProductFilterApi; showSearch?: boolean }) {
  const { state, facets } = filters;
  const categories = useCategories();

  return (
    <div className="flex flex-col gap-6">
      {showSearch && (
        <div className="relative">
          <IconSearch className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
          <input
            value={state.search}
            onChange={(e) => filters.setSearch(e.target.value)}
            placeholder="ابحث عن ماركة أو موديل..."
            className="field rounded-full py-3 pe-11 ps-11"
          />
          {state.search && (
            <button
              type="button"
              onClick={() => filters.setSearch("")}
              aria-label="مسح البحث"
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted transition hover:bg-surface-3 hover:text-ink"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <FilterGroup label="النوع" icon={<IconGrid className="h-3.5 w-3.5" />}>
        <div className="flex flex-wrap gap-2">
          {[{ slug: "all", name: "الكل" }, ...categories].map((opt) => (
            <Pill key={opt.slug} active={state.category === opt.slug} onClick={() => filters.setCategory(opt.slug)} large>
              {opt.name}
            </Pill>
          ))}
        </div>
      </FilterGroup>

      {facets.brands.length > 0 && (
        <FilterGroup label="الماركة" icon={<IconTag className="h-3.5 w-3.5" />}>
          <Chips values={facets.brands} selected={state.brands} onToggle={filters.toggleBrand} />
        </FilterGroup>
      )}

      <FilterGroup label="السعر" icon={<IconSliders className="h-3.5 w-3.5" />}>
        <PriceRange filters={filters} />
      </FilterGroup>

      {facets.genders.length > 0 && (
        <FilterGroup label="الفئة">
          <Chips
            values={facets.genders}
            label={(v) => genderLabel[v as Gender] ?? v}
            selected={state.genders}
            onToggle={filters.toggleGender}
          />
        </FilterGroup>
      )}

      {facets.shapes.length > 1 && (
        <FilterGroup label="شكل الإطار" icon={<IconGlasses className="h-3.5 w-3.5" />}>
          <Chips
            values={facets.shapes}
            label={(v) => frameShapeLabel[v as FrameShape] ?? v}
            selected={state.shapes}
            onToggle={filters.toggleShape}
          />
        </FilterGroup>
      )}

      {facets.colors.length > 0 && (
        <FilterGroup label="اللون" icon={<IconPalette className="h-3.5 w-3.5" />}>
          <Chips values={facets.colors} selected={state.colors} onToggle={filters.toggleColor} />
        </FilterGroup>
      )}

      {facets.materials.length > 0 && (
        <FilterGroup label="الخامة">
          <Chips
            values={facets.materials}
            label={(v) => materialLabel[v as FrameMaterial] ?? v}
            selected={state.materials}
            onToggle={filters.toggleMaterial}
          />
        </FilterGroup>
      )}

      {facets.sizes.length > 0 && (
        <FilterGroup label="المقاس" icon={<IconRuler className="h-3.5 w-3.5" />}>
          <Chips
            values={facets.sizes}
            label={(v) => sizeLabel[v as FrameSize] ?? v}
            selected={state.sizes}
            onToggle={filters.toggleSize}
          />
        </FilterGroup>
      )}

      <FilterGroup label="خيارات أخرى">
        <div className="flex flex-col gap-2">
          <Check checked={state.availability === "in_stock"} onChange={(v) => filters.setAvailability(v ? "in_stock" : "all")}>
            المتوفر فقط
          </Check>
          <Check checked={state.prescriptionOnly} onChange={(v) => filters.setFlag("prescriptionOnly", v)}>
            يقبل عدسات طبية
          </Check>
          <Check checked={state.newOnly} onChange={(v) => filters.setFlag("newOnly", v)}>
            وصل حديثاً
          </Check>
          <Check checked={state.bestsellerOnly} onChange={(v) => filters.setFlag("bestsellerOnly", v)}>
            الأكثر مبيعاً
          </Check>
          <Check checked={state.discountOnly} onChange={(v) => filters.setFlag("discountOnly", v)}>
            عليه خصم
          </Check>
        </div>
      </FilterGroup>

      {filters.activeCount > 0 && (
        <button
          type="button"
          onClick={filters.reset}
          className="rounded-full border border-line py-2 text-xs font-bold text-ink-soft transition hover:border-danger/40 hover:text-danger"
        >
          مسح الفلاتر ({filters.activeCount})
        </button>
      )}
    </div>
  );
}

function PriceRange({ filters }: { filters: ProductFilterApi }) {
  const { state, facets } = filters;
  const ceiling = facets.priceCeiling;
  const min = state.minPrice ?? 0;
  const max = state.maxPrice ?? ceiling;
  const step = 5000;
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between text-xs font-bold">
        <span className="rounded-full bg-accent/12 px-2.5 py-1 text-accent">{formatPrice(min)}</span>
        <span className="text-muted">إلى</span>
        <span className="rounded-full bg-accent/12 px-2.5 py-1 text-accent">{formatPrice(max)}</span>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={ceiling}
          step={step}
          value={min}
          onChange={(e) => filters.setPriceRange(Math.min(Number(e.target.value), max - step), state.maxPrice)}
          aria-label="السعر الأدنى"
          className="w-full"
        />
        <input
          type="range"
          min={0}
          max={ceiling}
          step={step}
          value={max}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), min + step);
            filters.setPriceRange(state.minPrice, v >= ceiling ? null : v);
          }}
          aria-label="السعر الأقصى"
          className="w-full"
        />
      </div>
    </div>
  );
}

function Chips({
  values,
  selected,
  onToggle,
  label = (v) => v,
}: {
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
  label?: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map((v) => (
        <Pill key={v} active={selected.includes(v)} onClick={() => onToggle(v)}>
          {label(v)}
        </Pill>
      ))}
    </div>
  );
}

function Pill({ active, onClick, children, large = false }: { active: boolean; onClick: () => void; children: React.ReactNode; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border font-bold transition duration-200 active:scale-95",
        large ? "px-4 py-2 text-sm" : "px-3.5 py-1.5 text-xs tracking-wide",
        active
          ? large
            ? "border-transparent bg-gradient-to-l from-accent to-accent-2 text-accent-contrast shadow-[0_8px_22px_-12px_var(--accent)]"
            : "border-accent/50 bg-accent/12 text-accent"
          : "border-line bg-surface-2 text-ink-soft hover:border-accent/40 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      {children}
    </label>
  );
}

function FilterGroup({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
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
