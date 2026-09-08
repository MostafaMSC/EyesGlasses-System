"use client";

import { useEffect, useRef } from "react";
import { getProductVisualSrc } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

export function TryOnProductSelector({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const { products } = useProductStore();
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the selected frame in view when it changes (e.g. opened from a card
  // far down the catalog).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  return (
    <div className="hide-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1">
      {products.map((product) => {
        const active = product.id === activeId;
        return (
          <button
            key={product.id}
            ref={active ? activeRef : undefined}
            onClick={() => onSelect(product.id)}
            aria-pressed={active}
            // No per-tile backdrop-filter: the shelf behind already provides
            // the glass, and a dozen blur layers is costly on low-end phones.
            className={cn(
              "group flex w-[92px] shrink-0 flex-col items-center gap-1 rounded-2xl p-2 transition-all duration-200",
              active
                ? "bg-white ring-2 ring-[#f0b64f] shadow-[0_10px_28px_-10px_rgba(240,182,79,0.6)]"
                : "bg-white/12 ring-1 ring-white/20 hover:bg-white/22"
            )}
          >
            {/* Light tile behind the frame so dark frames read clearly */}
            <span
              className={cn(
                "flex h-12 w-full items-center justify-center rounded-xl px-1.5 transition-colors",
                active ? "bg-white" : "bg-white/85"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getProductVisualSrc(product)}
                alt={`${product.brand} ${product.name}`}
                loading="lazy"
                className="max-h-full w-full object-contain drop-shadow-[0_2px_3px_rgba(24,20,15,0.25)]"
              />
            </span>
            <span
              className={cn(
                "w-full truncate text-[10px] font-bold leading-tight",
                active ? "text-[#0e1117]" : "text-white"
              )}
            >
              {product.brand}
            </span>
            <span
              className={cn(
                "w-full truncate text-[10px] leading-tight",
                active ? "text-[#6b7589]" : "text-white/70"
              )}
            >
              {formatPrice(product.price)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
