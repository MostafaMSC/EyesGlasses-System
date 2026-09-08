"use client";

import { getProductVisualSrc, type Product } from "@/data/products";
import { overlayTransform, type OverlayPlacement } from "@/lib/overlayPlacement";
import { CONTACT_SHADOW, edgeFade, edgeFadeMask } from "@/lib/overlayAppearance";

export function GlassesOverlay({
  product,
  placement,
}: {
  product: Product;
  placement: OverlayPlacement | null;
}) {
  if (!placement) return null;
  const src = getProductVisualSrc(product);

  // Fading the outer edges makes the temple arms read as continuing out of
  // view rather than stopping in mid-air beside the head; the fade leans with
  // head yaw so the arm turning away is the one that disappears.
  const mask = edgeFadeMask(edgeFade(product.tryOn.edgeFade, placement.yawDeg));

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute select-none"
      style={{
        left: placement.leftPx,
        top: placement.topPx,
        width: placement.widthPx,
        height: placement.heightPx,
        transform: overlayTransform(placement),
        transformOrigin: "50% 50%",
        transformStyle: "preserve-3d",
        filter: CONTACT_SHADOW.css,
        maskImage: mask,
        WebkitMaskImage: mask,
        willChange: "transform, left, top, width, height",
      }}
    />
  );
}
