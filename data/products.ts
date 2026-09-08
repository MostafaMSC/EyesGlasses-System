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

function tryOn(config: TryOnConfig): TryOnConfig {
  return config;
}

export const products: Product[] = [
  {
    id: "p1",
    slug: "rayban-aviator-classic",
    brand: "Ray-Ban",
    name: "Aviator Classic",
    category: "sunglasses",
    price: 185000,
    compareAtPrice: 225000,
    images: [],
    description:
      "الإطار الطياري الأصلي بعدسات متدرجة وهيكل معدني خفيف. تصميم خالد يناسب جميع أشكال الوجه تقريباً.",
    colors: [
      { name: "ذهبي", hex: "#C9A24B" },
      { name: "فضي", hex: "#9CA3AF" },
    ],
    availability: "in_stock",
    featured: true,
    bestseller: true,
    createdAt: "2026-06-01",
    tryOn: tryOn({
      frameShape: "aviator",
      color: "#C9A24B",
      lensColor: "#2b3a4a",
      lensOpacity: 0.55,
      scale: 1.02,
      offsetX: 0,
      offsetY: 0.1,
      rotationOffset: 0,
    }),
  },
  {
    id: "p2",
    slug: "rayban-wayfarer",
    brand: "Ray-Ban",
    name: "Wayfarer",
    category: "sunglasses",
    price: 165000,
    images: [],
    description:
      "الشكل الأكثر شهرة في عالم النظارات الشمسية. إطار أكيتات سميك يمنح إطلالة جريئة وعصرية.",
    colors: [
      { name: "أسود لامع", hex: "#151515" },
      { name: "بني سلحفاة", hex: "#6B4A2F" },
    ],
    availability: "in_stock",
    bestseller: true,
    createdAt: "2026-05-20",
    tryOn: tryOn({
      frameShape: "wayfarer",
      color: "#151515",
      lensColor: "#1c1c1c",
      lensOpacity: 0.75,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0.08,
      rotationOffset: 0,
    }),
  },
  {
    id: "p3",
    slug: "dior-30montaigne",
    brand: "Dior",
    name: "30 Montaigne",
    category: "sunglasses",
    price: 350000,
    images: [],
    description:
      "إطار كات آي فاخر مستوحى من دار ديور الباريسية. تفاصيل دقيقة وحضور لافت في أي إطلالة.",
    colors: [
      { name: "أسود", hex: "#181818" },
      { name: "عسلي", hex: "#A9702B" },
    ],
    availability: "in_stock",
    featured: true,
    createdAt: "2026-07-02",
    tryOn: tryOn({
      frameShape: "catEye",
      color: "#181818",
      lensColor: "#3a2a1c",
      lensOpacity: 0.6,
      scale: 0.98,
      offsetX: 0,
      offsetY: 0.08,
      rotationOffset: 0,
    }),
  },
  {
    id: "p4",
    slug: "cartier-panthere",
    brand: "Cartier",
    name: "Panthère",
    category: "sunglasses",
    price: 480000,
    images: [],
    description:
      "قطعة استثنائية بإطار طياري مطعّم بتفاصيل ذهبية. رمز للفخامة الفرنسية الأصيلة.",
    colors: [{ name: "ذهبي", hex: "#D4AF37" }],
    availability: "low_stock",
    featured: true,
    createdAt: "2026-04-11",
    tryOn: tryOn({
      frameShape: "aviator",
      color: "#D4AF37",
      lensColor: "#4a3a1e",
      lensOpacity: 0.5,
      scale: 1.03,
      offsetX: 0,
      offsetY: 0.1,
      rotationOffset: 0,
    }),
  },
  {
    id: "p5",
    slug: "chanel-round-signature",
    brand: "Chanel",
    name: "Round Signature",
    category: "sunglasses",
    price: 395000,
    images: [],
    description:
      "إطار دائري أنيق بروح باريسية كلاسيكية، مثالي لإطلالة راقية وهادئة في آن واحد.",
    colors: [
      { name: "أسود", hex: "#161616" },
      { name: "بيج", hex: "#D8CBB8" },
    ],
    availability: "in_stock",
    createdAt: "2026-03-28",
    tryOn: tryOn({
      frameShape: "round",
      color: "#161616",
      lensColor: "#2a2a2a",
      lensOpacity: 0.65,
      scale: 0.97,
      offsetX: 0,
      offsetY: 0.09,
      rotationOffset: 0,
    }),
  },
  {
    id: "p6",
    slug: "prada-linea-rossa",
    brand: "Prada",
    name: "Linea Rossa",
    category: "sunglasses",
    price: 310000,
    images: [],
    description:
      "تصميم رياضي فاخر بإطار واحد ملفوف يمنح حماية أوسع وإطلالة جريئة عصرية.",
    colors: [{ name: "أسود مطاط", hex: "#1c1c1c" }],
    availability: "in_stock",
    isNew: true,
    createdAt: "2026-08-15",
    tryOn: tryOn({
      frameShape: "sport",
      color: "#1c1c1c",
      lensColor: "#20344a",
      lensOpacity: 0.6,
      scale: 1.04,
      offsetX: 0,
      offsetY: 0.06,
      rotationOffset: 0,
    }),
  },
  {
    id: "p7",
    slug: "tomford-oversized",
    brand: "Tom Ford",
    name: "Oversized Square",
    category: "sunglasses",
    price: 275000,
    images: [],
    description:
      "إطار مربع كبير الحجم يمنح حضوراً قوياً بلمسة هوليوودية فاخرة.",
    colors: [
      { name: "هافانا", hex: "#7A4A24" },
      { name: "أسود", hex: "#1a1a1a" },
    ],
    availability: "in_stock",
    bestseller: true,
    createdAt: "2026-05-02",
    tryOn: tryOn({
      frameShape: "oversized",
      color: "#7A4A24",
      lensColor: "#402a16",
      lensOpacity: 0.55,
      scale: 1.05,
      offsetX: 0,
      offsetY: 0.09,
      rotationOffset: 0,
    }),
  },
  {
    id: "p8",
    slug: "rayban-optical-round",
    brand: "Ray-Ban",
    name: "Round Metal Optical",
    category: "optical",
    price: 145000,
    images: [],
    description:
      "نظارة طبية بإطار دائري معدني خفيف، مريحة للاستخدام اليومي الطويل ومناسبة لمعظم الوصفات الطبية.",
    colors: [
      { name: "ذهبي", hex: "#B8975A" },
      { name: "فضي", hex: "#A6ADB4" },
    ],
    availability: "in_stock",
    createdAt: "2026-02-14",
    tryOn: tryOn({
      frameShape: "round",
      color: "#B8975A",
      lensColor: "#eaf1f5",
      lensOpacity: 0.18,
      scale: 0.96,
      offsetX: 0,
      offsetY: 0.08,
      rotationOffset: 0,
    }),
  },
  {
    id: "p9",
    slug: "dior-optical-rect",
    brand: "Dior",
    name: "Rectangular Optic",
    category: "optical",
    price: 320000,
    images: [],
    description:
      "إطار طبي أسود بقصة مربعة وخطوط نظيفة، مع ذراعين معدنيتين رفيعتين وعدسات شفافة تماماً.",
    colors: [{ name: "أسود", hex: "#181818" }],
    availability: "in_stock",
    featured: true,
    createdAt: "2026-06-22",
    tryOn: tryOn({
      frameShape: "acetateSquare",
      color: "#141414",
      lensColor: "#e2ecf3",
      lensOpacity: 0.09,
      templeColor: "#c8ccd2",
      scale: 1.0,
      offsetX: 0,
      offsetY: 0.04,
      rotationOffset: 0,
    }),
  },
  {
    id: "p10",
    slug: "cartier-optical-panthere",
    brand: "Cartier",
    name: "Panthère Optic",
    category: "optical",
    price: 410000,
    images: [],
    description:
      "نظارة طبية فاخرة بإطار رفيع وتفاصيل ذهبية دقيقة، توازن بين الأناقة والراحة اليومية.",
    colors: [{ name: "ذهبي وردي", hex: "#C79A7C" }],
    availability: "preorder",
    createdAt: "2026-08-30",
    tryOn: tryOn({
      frameShape: "metalSquare",
      color: "#C79A7C",
      lensColor: "#f2eee7",
      lensOpacity: 0.1,
      templeColor: "#d8b49a",
      scale: 0.97,
      offsetX: 0,
      offsetY: 0.05,
      rotationOffset: 0,
    }),
  },
  {
    id: "p11",
    slug: "chanel-catseye-optic",
    brand: "Chanel",
    name: "Cat-Eye Optic",
    category: "optical",
    price: 355000,
    images: [],
    description:
      "إطار طبي بقصة كات آي أنثوية راقية، يبرز ملامح الوجه بأسلوب باريسي مميز.",
    colors: [
      { name: "أسود", hex: "#171717" },
      { name: "عاجي", hex: "#E8E1D3" },
    ],
    availability: "in_stock",
    createdAt: "2026-04-05",
    tryOn: tryOn({
      frameShape: "catEye",
      color: "#171717",
      lensColor: "#f0f0f0",
      lensOpacity: 0.14,
      scale: 0.97,
      offsetX: 0,
      offsetY: 0.08,
      rotationOffset: 0,
    }),
  },
  {
    id: "p12",
    slug: "prada-optical-oversized",
    brand: "Prada",
    name: "Oversized Optic",
    category: "optical",
    price: 298000,
    images: [],
    description:
      "إطار طبي كبير بشخصية قوية، خيار مثالي لمن يبحث عن حضور لافت حتى بدون نظارة شمسية.",
    colors: [{ name: "هافانا فاتح", hex: "#8A5A2E" }],
    availability: "in_stock",
    isNew: true,
    createdAt: "2026-08-25",
    tryOn: tryOn({
      frameShape: "oversized",
      color: "#8A5A2E",
      lensColor: "#f4efe8",
      lensOpacity: 0.12,
      scale: 1.02,
      offsetX: 0,
      offsetY: 0.08,
      rotationOffset: 0,
    }),
  },
  {
    id: "p13",
    slug: "tomford-wayfarer-sun",
    brand: "Tom Ford",
    name: "Signature Wayfarer",
    category: "sunglasses",
    price: 265000,
    compareAtPrice: 300000,
    images: [],
    description:
      "قراءة عصرية لشكل الويفيرر الكلاسيكي بلمسة تصميم توم فورد الفاخرة وتفاصيل معدنية دقيقة.",
    colors: [{ name: "أسود", hex: "#151515" }],
    availability: "in_stock",
    bestseller: true,
    createdAt: "2026-07-19",
    tryOn: tryOn({
      frameShape: "wayfarer",
      color: "#151515",
      lensColor: "#232323",
      lensOpacity: 0.7,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0.08,
      rotationOffset: 0,
    }),
  },
  {
    id: "p14",
    slug: "rayban-round-sun",
    brand: "Ray-Ban",
    name: "Round Sun",
    category: "sunglasses",
    price: 175000,
    images: [],
    description:
      "إطار دائري كلاسيكي بروح تسعينية، خفيف الوزن ومناسب للاستخدام اليومي.",
    colors: [
      { name: "نحاسي", hex: "#B87333" },
      { name: "أسود", hex: "#1a1a1a" },
    ],
    availability: "in_stock",
    createdAt: "2026-03-10",
    tryOn: tryOn({
      frameShape: "round",
      color: "#B87333",
      lensColor: "#3a2e20",
      lensOpacity: 0.55,
      scale: 0.98,
      offsetX: 0,
      offsetY: 0.08,
      rotationOffset: 0,
    }),
  },
];

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
