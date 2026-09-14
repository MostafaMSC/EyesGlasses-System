"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { discountPercent, isActive, type Product } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { searchProducts } from "@/lib/search";

/**
 * Catalogue filtering, sorting and search — all client-side over the loaded
 * catalogue, which is a few KB, so every change is instant and needs no
 * request. The parts worth sharing in a link (query, category, sort) are
 * mirrored into the URL; the rest stays in memory.
 */

export type SortOption =
  | "recommended"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "bestselling"
  | "discount";

export const sortOptions: { value: SortOption; label: string }[] = [
  { value: "recommended", label: "الأنسب لك" },
  { value: "newest", label: "الأحدث" },
  { value: "price_asc", label: "السعر: من الأقل للأعلى" },
  { value: "price_desc", label: "السعر: من الأعلى للأقل" },
  { value: "bestselling", label: "الأكثر مبيعاً" },
  { value: "discount", label: "أكبر خصم" },
];

export type AvailabilityFilter = "all" | "in_stock";

export interface FilterState {
  search: string;
  category: string;
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  genders: string[];
  shapes: string[];
  colors: string[];
  materials: string[];
  sizes: string[];
  availability: AvailabilityFilter;
  prescriptionOnly: boolean;
  newOnly: boolean;
  bestsellerOnly: boolean;
  discountOnly: boolean;
  sort: SortOption;
}

const EMPTY: FilterState = {
  search: "",
  category: "all",
  brands: [],
  minPrice: null,
  maxPrice: null,
  genders: [],
  shapes: [],
  colors: [],
  materials: [],
  sizes: [],
  availability: "all",
  prescriptionOnly: false,
  newOnly: false,
  bestsellerOnly: false,
  discountOnly: false,
  sort: "recommended",
};

function isSort(value: string | null): value is SortOption {
  return sortOptions.some((o) => o.value === value);
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function useProductFilters() {
  const { products: allProducts } = useProductStore();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [state, setState] = useState<FilterState>(() => ({
    ...EMPTY,
    search: params.get("q") ?? "",
    category: params.get("category") ?? "all",
    sort: isSort(params.get("sort")) ? (params.get("sort") as SortOption) : "recommended",
    newOnly: params.get("new") === "1",
    bestsellerOnly: params.get("bestsellers") === "1",
    discountOnly: params.get("discount") === "1",
  }));

  // Follow the URL when it changes underneath us (header nav, search box).
  useEffect(() => {
    const search = params.get("q") ?? "";
    const category = params.get("category") ?? "all";
    const sort = params.get("sort");
    queueMicrotask(() =>
      setState((s) =>
        s.search === search && s.category === category && (!isSort(sort) || s.sort === sort)
          ? s
          : { ...s, search, category, sort: isSort(sort) ? sort : s.sort }
      )
    );
  }, [params]);

  const syncUrl = useCallback(
    (next: Partial<Pick<FilterState, "search" | "category" | "sort">>) => {
      const q = new URLSearchParams(params.toString());
      if (next.search !== undefined) {
        if (next.search) q.set("q", next.search);
        else q.delete("q");
      }
      if (next.category !== undefined) {
        if (next.category !== "all") q.set("category", next.category);
        else q.delete("category");
      }
      if (next.sort !== undefined) {
        if (next.sort !== "recommended") q.set("sort", next.sort);
        else q.delete("sort");
      }
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const update = useCallback((patch: Partial<FilterState>) => setState((s) => ({ ...s, ...patch })), []);

  const live = useMemo(() => allProducts.filter(isActive), [allProducts]);

  const facets = useMemo(() => {
    const brands = new Set<string>();
    const colors = new Set<string>();
    const shapes = new Set<string>();
    const materials = new Set<string>();
    const genders = new Set<string>();
    const sizes = new Set<string>();
    let ceiling = 0;
    for (const p of live) {
      brands.add(p.brand);
      shapes.add(p.tryOn.frameShape);
      for (const c of p.colors) colors.add(c.name);
      if (p.specs?.material) materials.add(p.specs.material);
      if (p.specs?.gender) genders.add(p.specs.gender);
      if (p.specs?.size) sizes.add(p.specs.size);
      ceiling = Math.max(ceiling, p.price);
    }
    return {
      brands: Array.from(brands).sort(),
      colors: Array.from(colors),
      shapes: Array.from(shapes),
      materials: Array.from(materials),
      genders: Array.from(genders),
      sizes: Array.from(sizes),
      priceCeiling: Math.max(50_000, Math.ceil(ceiling / 5000) * 5000),
    };
  }, [live]);

  const filtered: Product[] = useMemo(() => {
    let list = live;
    const s = state;
    if (s.category !== "all") list = list.filter((p) => p.category === s.category);
    if (s.brands.length) list = list.filter((p) => s.brands.includes(p.brand));
    if (s.minPrice !== null) list = list.filter((p) => p.price >= s.minPrice!);
    if (s.maxPrice !== null) list = list.filter((p) => p.price <= s.maxPrice!);
    if (s.genders.length) list = list.filter((p) => p.specs?.gender && (s.genders.includes(p.specs.gender) || p.specs.gender === "unisex"));
    if (s.shapes.length) list = list.filter((p) => s.shapes.includes(p.tryOn.frameShape));
    if (s.colors.length) list = list.filter((p) => p.colors.some((c) => s.colors.includes(c.name)));
    if (s.materials.length) list = list.filter((p) => p.specs?.material && s.materials.includes(p.specs.material));
    if (s.sizes.length) list = list.filter((p) => p.specs?.size && s.sizes.includes(p.specs.size));
    if (s.availability === "in_stock") list = list.filter((p) => p.availability === "in_stock" && (typeof p.stock !== "number" || p.stock > 0));
    if (s.prescriptionOnly) list = list.filter((p) => p.specs?.prescriptionCompatible || p.category === "optical");
    if (s.newOnly) list = list.filter((p) => p.isNew);
    if (s.bestsellerOnly) list = list.filter((p) => p.bestseller);
    if (s.discountOnly) list = list.filter((p) => discountPercent(p) > 0);
    if (s.search.trim()) list = searchProducts(list, s.search);

    switch (s.sort) {
      case "price_asc":
        return [...list].sort((a, b) => a.price - b.price);
      case "price_desc":
        return [...list].sort((a, b) => b.price - a.price);
      case "newest":
        return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      case "bestselling":
        return [...list].sort((a, b) => Number(b.bestseller) - Number(a.bestseller));
      case "discount":
        return [...list].sort((a, b) => discountPercent(b) - discountPercent(a));
      case "recommended":
      default:
        // Search already ranks by relevance; otherwise the shop's picks first.
        if (s.search.trim()) return list;
        return [...list].sort(
          (a, b) => Number(b.featured || b.bestseller) - Number(a.featured || a.bestseller) || Number(b.isNew) - Number(a.isNew)
        );
    }
  }, [live, state]);

  const activeCount =
    (state.category !== "all" ? 1 : 0) +
    state.brands.length +
    (state.minPrice !== null || state.maxPrice !== null ? 1 : 0) +
    state.genders.length +
    state.shapes.length +
    state.colors.length +
    state.materials.length +
    state.sizes.length +
    (state.availability !== "all" ? 1 : 0) +
    Number(state.prescriptionOnly) +
    Number(state.newOnly) +
    Number(state.bestsellerOnly) +
    Number(state.discountOnly);

  return {
    state,
    facets,
    filtered,
    activeCount,
    setSearch: (search: string) => {
      update({ search });
      syncUrl({ search });
    },
    setCategory: (category: string) => {
      update({ category });
      syncUrl({ category });
    },
    setSort: (sort: SortOption) => {
      update({ sort });
      syncUrl({ sort });
    },
    toggleBrand: (b: string) => update({ brands: toggle(state.brands, b) }),
    toggleGender: (g: string) => update({ genders: toggle(state.genders, g) }),
    toggleShape: (v: string) => update({ shapes: toggle(state.shapes, v) }),
    toggleColor: (v: string) => update({ colors: toggle(state.colors, v) }),
    toggleMaterial: (v: string) => update({ materials: toggle(state.materials, v) }),
    toggleSize: (v: string) => update({ sizes: toggle(state.sizes, v) }),
    setPriceRange: (minPrice: number | null, maxPrice: number | null) => update({ minPrice, maxPrice }),
    setAvailability: (availability: AvailabilityFilter) => update({ availability }),
    setFlag: (key: "prescriptionOnly" | "newOnly" | "bestsellerOnly" | "discountOnly", value: boolean) => update({ [key]: value }),
    reset: () => {
      setState({ ...EMPTY, search: state.search, sort: state.sort });
      syncUrl({ category: "all" });
    },
  };
}

export type ProductFilterApi = ReturnType<typeof useProductFilters>;
