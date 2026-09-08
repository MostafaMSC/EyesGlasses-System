import type { FrameShape } from "@/lib/frameShapes";
import { frameSvgDataUri } from "@/lib/frameShapes";

export type Category = "sunglasses" | "optical";
export type Availability = "in_stock" | "low_stock" | "preorder";

export interface ProductColor {
  name: string;
  hex: string;
}

/** Lens-centre positions within an overlay image, as 0..1 fractions. */
export interface OverlayGeometry {
  /** width / height of the image. */
  aspect: number;
  lensLeftX: number;
  lensRightX: number;
  lensY: number;
}

/**
 * Per-product try-on tuning. Different frames have different real-world
 * proportions, so `scale` / `offsetX` / `offsetY` / `rotationOffset` let you
 * nudge each product until it sits naturally on a face.
 *
 * `overlayImage`, when set, is used instead of the generated demo SVG for
 * BOTH the product photo and the live try-on — drop in a transparent PNG of
 * the real frame and the rest of the app doesn't need to change.
 */
export interface TryOnConfig {
  frameShape: FrameShape;
  color: string;
  lensColor?: string;
  lensOpacity?: number;
  /** Accent colour for temple arms / hinges (e.g. metallic on a black rim). */
  templeColor?: string;
  overlayImage?: string;
  /**
   * Where the lens centres sit inside `overlayImage`, as fractions of the
   * image's own width/height. Only needed when a real photo isn't framed like
   * the generated frames — set it and any crop will still land on the eyes.
   */
  overlayGeometry?: OverlayGeometry;
  /**
   * Fraction of the overlay's width faded out at each side (0 disables it).
   * Stops flat temple arms from hanging in mid-air beside the head.
   */
  edgeFade?: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationOffset: number;
}

export interface Product {
  id: string;
  slug: string;
  brand: string;
  name: string;
  category: Category;
  price: number;
  compareAtPrice?: number;
  /** Demo images are generated on the fly from `tryOn` — replace with real photo URLs later. */
  images: string[];
  description: string;
  colors: ProductColor[];
  availability: Availability;
  featured?: boolean;
  bestseller?: boolean;
  isNew?: boolean;
  createdAt: string;
  tryOn: TryOnConfig;
}

/**
 * The demo catalogue (fictional listings under real luxury brand names) has
 * been removed. Add the shop's real frames here — each needs a straight-on
 * photo of the actual glasses as `tryOn.overlayImage` (see README.md
 * "Replacing the demo frames with real product images") — or add them
 * through the /admin panel, which walks through the photo upload and
 * alignment for you.
 */
export const products: Product[] = [];

export const brands = Array.from(new Set(products.map((p) => p.brand)));

export function getProductVisualSrc(product: Pick<Product, "tryOn" | "images">): string {
  if (product.images[0]) return product.images[0];
  if (product.tryOn.overlayImage) return product.tryOn.overlayImage;
  return frameSvgDataUri(product.tryOn.frameShape, {
    color: product.tryOn.color,
    lensColor: product.tryOn.lensColor ?? product.tryOn.color,
    lensOpacity: product.tryOn.lensOpacity ?? 0.5,
    templeColor: product.tryOn.templeColor,
  });
}

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getRelatedProducts(product: Product, count = 4): Product[] {
  return products
    .filter((p) => p.id !== product.id && (p.brand === product.brand || p.category === product.category))
    .slice(0, count);
}
