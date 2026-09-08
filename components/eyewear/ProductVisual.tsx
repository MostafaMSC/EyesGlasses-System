import { getProductVisualSrc, type Product } from "@/data/products";
import { cn } from "@/lib/cn";

/**
 * Frames are photographed/drawn on transparency, so each category gets its own
 * lit backdrop rather than a flat fill — dark frames would otherwise vanish
 * into the dark surface.
 */
const backdrops: Record<string, string> = {
  sunglasses: "from-accent/12 via-surface-2 to-surface",
  optical: "from-accent-3/12 via-surface-2 to-surface",
};

export function ProductVisual({
  product,
  className,
  imgClassName,
  priority = false,
}: {
  product: Pick<Product, "tryOn" | "images" | "category">;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  const src = getProductVisualSrc(product);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] bg-gradient-to-br",
        backdrops[product.category] ?? backdrops.sunglasses,
        className
      )}
    >
      {/* Spotlight + contact shadow give the frame a place to sit. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_35%,rgba(255,255,255,0.10),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-[14%] bottom-[10%] h-[12%] rounded-full bg-black/35 blur-xl" />

      <div className="relative flex h-full w-full items-center justify-center p-[12%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading={priority ? "eager" : "lazy"}
          className={cn("w-full drop-shadow-[0_18px_26px_rgba(0,0,0,0.45)]", imgClassName)}
        />
      </div>
    </div>
  );
}
