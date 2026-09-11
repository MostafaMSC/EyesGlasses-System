"use client";

import { getProductVisualSrc, type Product } from "@/data/products";
import { overlayTransform, type OverlayPlacement } from "@/lib/overlayPlacement";
import { CONTACT_SHADOW, edgeFade, edgeFadeMask, sideBlendWeight } from "@/lib/overlayAppearance";

export function GlassesOverlay({
  product,
  placement,
  sideSrc,
  sidePlacement,
}: {
  product: Product;
  placement: OverlayPlacement | null;
  /**
   * The side-profile image relevant to the current yaw (left or right,
   * chosen by the caller — see `selectSideOverlay` in overlayPlacement.ts)
   * and its own placement. Omit or pass null when the product has none for
   * this direction; the front image then shows at every angle, unchanged.
   */
  sideSrc?: string | null;
  sidePlacement?: OverlayPlacement | null;
}) {
  if (!placement) return null;
  const frontSrc = getProductVisualSrc(product);

  // Fading the outer edges makes the temple arms read as continuing out of
  // view rather than stopping in mid-air beside the head; the fade leans with
  // head yaw so the arm turning away is the one that disappears. Only the
  // front image needs this — the side image's arm is real, not implied.
  const mask = edgeFadeMask(edgeFade(product.tryOn.edgeFade, placement.yawDeg));

  const hasSide = Boolean(sideSrc && sidePlacement);
  const blend = hasSide ? sideBlendWeight(placement.yawDeg) : 0;

  return (
    <>
      {blend < 1 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frontSrc}
          alt=""
          draggable={false}
          className="pointer-events-none absolute select-none"
          style={{
            left: placement.leftPx,
            top: placement.topPx,
            width: placement.widthPx,
            height: placement.heightPx,
            opacity: 1 - blend,
            transform: overlayTransform(placement),
            transformOrigin: "50% 50%",
            transformStyle: "preserve-3d",
            filter: CONTACT_SHADOW.css,
            maskImage: mask,
            WebkitMaskImage: mask,
            willChange: "transform, left, top, width, height, opacity",
          }}
        />
      )}
      {hasSide && blend > 0 && sidePlacement && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sideSrc!}
          alt=""
          draggable={false}
          className="pointer-events-none absolute select-none"
          style={{
            left: sidePlacement.leftPx,
            top: sidePlacement.topPx,
            width: sidePlacement.widthPx,
            height: sidePlacement.heightPx,
            opacity: blend,
            transform: overlayTransform(sidePlacement),
            transformOrigin: "50% 50%",
            transformStyle: "preserve-3d",
            filter: CONTACT_SHADOW.css,
            willChange: "transform, left, top, width, height, opacity",
          }}
        />
      )}
    </>
  );
}
