import type { FrameShape } from "@/lib/frameShapes";
import { frameSvgDataUri } from "@/lib/frameShapes";

/**
 * Category slug. The two built-in ones are `sunglasses` and `optical`; the
 * admin can add more (see `data/siteSettings.ts` → `categories`), so this is
 * a string rather than a closed union.
 */
export type Category = string;
export type Availability = "in_stock" | "low_stock" | "preorder";
export type Gender = "men" | "women" | "unisex" | "kids";
export type FrameSize = "narrow" | "medium" | "wide";
export type FrameMaterial = "acetate" | "metal" | "titanium" | "tr90" | "mixed" | "other";

/** One picture in a product's gallery, by what it shows. */
export type GalleryKind = "front" | "left" | "right" | "lifestyle" | "detail";
export interface GalleryImage {
  kind: GalleryKind;
  /** A data URL when stored; an `/api/products/{id}/asset/gallery-N` URL when served. */
  src: string;
}

/** Physical frame measurements, in millimetres (weight in grams). */
export interface FrameDimensions {
  lensWidth?: number;
  bridgeWidth?: number;
  templeLength?: number;
  frameWidth?: number;
  lensHeight?: number;
  weight?: number;
}

/**
 * Eyewear attributes the catalogue filters on. All optional: a product added
 * before these existed simply doesn't match those filters.
 */
export interface EyewearSpecs {
  material?: FrameMaterial;
  gender?: Gender;
  size?: FrameSize;
  /** Human-readable frame colour name, e.g. "أسود لامع". */
  colorName?: string;
  dimensions?: FrameDimensions;
  uvProtection?: boolean;
  prescriptionCompatible?: boolean;
  lensCompatibility?: string;
}

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
 * Alignment for a side-profile overlay image. A side shot shows one visible
 * lens/hinge rather than a pair, so unlike `OverlayGeometry` there is a
 * single anchor point (fractions of the image's own width/height) rather
 * than two lens centres.
 */
export interface SideOverlayGeometry {
  /** width / height of the image. */
  aspect: number;
  anchorX: number;
  anchorY: number;
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
  /**
   * A GLB/GLTF model of this frame. When set, the live try-on can render the
   * real thing in 3D — which is the only way the temple arms can genuinely
   * swing with the head and pass behind the ears, instead of a flat image
   * being tilted and faded.
   *
   * Modelling convention: facing +Z with the arms running back along -Z, so
   * the model's front face is the lens plane and its horizontal/vertical
   * centre is the lens-centre line. Any unit scale works — it is fitted to
   * the face automatically — and `scale`/`offsetX`/`offsetY` still fine-tune.
   */
  model3d?: string;
  /**
   * Strip the lens surfaces out of `model3d` when it is shown, leaving the
   * rims open so the wearer's eyes show through. Generated models come with
   * solid, opaque lenses baked into the frame's own mesh, which hides the
   * customer's eyes — the opposite of what a try-on is for. Off for
   * sunglasses, where the tint is the point.
   */
  hideLenses?: boolean;
  /**
   * Side-profile photos (temple arm visible, unlike the arm-less front
   * overlay). When present, the live try-on cross-fades into these as the
   * head turns past a yaw threshold instead of showing the front cutout
   * from an angle. Optional — a product with neither renders exactly as
   * front-only, same as before this field existed.
   */
  leftImage?: string;
  leftImageGeometry?: SideOverlayGeometry;
  rightImage?: string;
  rightImageGeometry?: SideOverlayGeometry;
}

export interface Product {
  id: string;
  slug: string;
  brand: string;
  name: string;
  category: Category;
  /** Current selling price. When `compareAtPrice` is higher, this is the sale price. */
  price: number;
  /** The pre-discount price, shown struck through. */
  compareAtPrice?: number;
  /** Plain URLs. Superseded by `gallery`; kept so older rows still read. */
  images: string[];
  /** Product photos by view. `gallery[0]` is the card picture when present. */
  gallery?: GalleryImage[];
  description: string;
  /** One line for cards and search results. */
  shortDescription?: string;
  sku?: string;
  /** Units on hand. `undefined` means stock isn't tracked for this product. */
  stock?: number;
  /** Below this many units the admin's inventory view flags it. */
  lowStockThreshold?: number;
  /** Hidden from the storefront (still editable in admin) when false. */
  active?: boolean;
  /** Whether the try-on button is offered. Defaults to true. */
  tryOnEnabled?: boolean;
  specs?: EyewearSpecs;
  seo?: { title?: string; description?: string };
  /** Approved-review summary, attached by the listing API; never stored. */
  rating?: { average: number; count: number };
  colors: ProductColor[];
  availability: Availability;
  featured?: boolean;
  bestseller?: boolean;
  isNew?: boolean;
  createdAt: string;
  tryOn: TryOnConfig;
}

/** Sale discount as a whole percentage, or 0 when the product isn't on sale. */
export function discountPercent(product: Pick<Product, "price" | "compareAtPrice">): number {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return 0;
  return Math.round((1 - product.price / product.compareAtPrice) * 100);
}

/** Whether the storefront shows the product at all. Older rows have no flag and are shown. */
export function isActive(product: Pick<Product, "active">): boolean {
  return product.active !== false;
}

/** Whether the try-on can be offered for it. */
export function canTryOn(product: Pick<Product, "tryOnEnabled">): boolean {
  return product.tryOnEnabled !== false;
}

export const genderLabel: Record<Gender, string> = {
  men: "رجالي",
  women: "نسائي",
  unisex: "للجنسين",
  kids: "أطفال",
};

export const sizeLabel: Record<FrameSize, string> = {
  narrow: "ضيق",
  medium: "متوسط",
  wide: "عريض",
};

export const materialLabel: Record<FrameMaterial, string> = {
  acetate: "أسيتات",
  metal: "معدن",
  titanium: "تيتانيوم",
  tr90: "TR90",
  mixed: "مختلط",
  other: "أخرى",
};

export const galleryKindLabel: Record<GalleryKind, string> = {
  front: "أمامية",
  left: "الجانب الأيسر",
  right: "الجانب الأيمن",
  lifestyle: "على الوجه",
  detail: "تفاصيل",
};

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

export function getProductVisualSrc(product: Pick<Product, "tryOn" | "images" | "gallery">): string {
  const front = product.gallery?.find((g) => g.kind === "front") ?? product.gallery?.[0];
  if (front) return front.src;
  if (product.images?.[0]) return product.images[0];
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
