"use client";

import { useMemo, useState } from "react";
import { type Category, type Product } from "@/data/products";
import { useProductStore } from "@/lib/productStore";

export type SortOption = "popular" | "price_asc" | "price_desc" | "newest";

// Floor for the price slider so it isn't stuck at 0 before any real product
// (demo or admin-added) exists.
const DEFAULT_PRICE_CEILING = 500000;

export function useProductFilters(initial?: { category?: Category | "all" }) {
  const { products: allProducts } = useProductStore();
  const allBrands = useMemo(
    () => Array.from(new Set(allProducts.map((p) => p.brand))),
    [allProducts]
  );
  const PRICE_CEILING = useMemo(
    () => Math.max(DEFAULT_PRICE_CEILING, ...allProducts.map((p) => p.price)),
    [allProducts]
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "all">(initial?.category ?? "all");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("popular");
  // Tracks the ceiling until the user actually drags the slider, so a newly
  // added product that costs more than anything else isn't filtered out.
  const [maxPriceOverride, setMaxPriceOverride] = useState<number | null>(null);
  const maxPrice = maxPriceOverride ?? PRICE_CEILING;
  const setMaxPrice = setMaxPriceOverride;

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]));
  };

  const filtered: Product[] = useMemo(() => {
    let list = allProducts.filter((p) => p.price <= maxPrice);

    if (category !== "all") list = list.filter((p) => p.category === category);
    if (selectedBrands.length > 0) list = list.filter((p) => selectedBrands.includes(p.brand));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) => p.brand.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.description.includes(search.trim())
      );
    }

    switch (sort) {
      case "price_asc":
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      case "newest":
        list = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        break;
      case "popular":
      default:
        list = [...list].sort((a, b) => Number(b.bestseller) - Number(a.bestseller));
        break;
    }

    return list;
  }, [allProducts, category, selectedBrands, search, sort, maxPrice]);

  return {
    search,
    setSearch,
    category,
    setCategory,
    brands: allBrands,
    selectedBrands,
    toggleBrand,
    sort,
    setSort,
    maxPrice,
    setMaxPrice,
    priceCeiling: PRICE_CEILING,
    filtered,
  };
}
