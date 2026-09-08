/**
 * Photorealistic frame renderer.
 *
 * Frames are generated as transparent SVGs and used both as the catalogue
 * image and as the live try-on overlay, so the two always match. Rather than
 * flat line art, each frame is built from real materials — layered acetate or
 * metal gradients, a specular highlight along the top rim, optical-glass
 * lenses and metal hinges — which reads as a product photo at overlay size.
 *
 * To use an actual product photo instead, set `product.tryOn.overlayImage`
 * (see data/products.ts and README.md). Nothing else needs to change.
 */

export type FrameShape =
  | "aviator"
  | "wayfarer"
  | "round"
  | "rectangle"
  | "catEye"
  | "oversized"
  | "sport"
  | "opticalSquare"
  | "acetateSquare"
  | "metalSquare";

export interface FrameStyleParams {
  color: string;
  lensColor: string;
  lensOpacity: number;
  /** Accent for temple arms / hinges (e.g. silver metal on a black rim). */
  templeColor?: string;
}

// Shared geometry — every shape places its two lens centres here, and the
// try-on maths depends on these exact constants.
export const FRAME_VIEWBOX_WIDTH = 300;
export const FRAME_VIEWBOX_HEIGHT = 120;
export const FRAME_EYE_SPAN = 160;
export const FRAME_EYE_CENTER_Y = 58;
const LEFT_CX = (FRAME_VIEWBOX_WIDTH - FRAME_EYE_SPAN) / 2; // 70
const RIGHT_CX = LEFT_CX + FRAME_EYE_SPAN; // 230
const Y = FRAME_EYE_CENTER_Y;

type Material = "acetate" | "metal";

interface ShapeDef {
  /** Outline of a single lens, centred on cx. */
  lens: (cx: number) => string;
  /** Bridge connecting the two lenses. */
  bridge: string;
  rimWidth: number;
  material: Material;
  /** Vertical position of the hinge / temple attachment. */
  hingeY?: number;
  /** Shape-specific extras drawn above the rim (e.g. an aviator brow bar). */
  extra?: (rimPaint: string, rimWidth: number) => string;
}

/* ------------------------------------------------------------------ *
 * Lens outlines
 * ------------------------------------------------------------------ */

const roundedRect = (cx: number, w: number, h: number, r: number, dy = 0) => {
  const x = cx - w / 2;
  const y = Y - h / 2 + dy;
  return `M ${x + r},${y} H ${x + w - r} Q ${x + w},${y} ${x + w},${y + r} V ${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} H ${x + r} Q ${x},${y + h} ${x},${y + h - r} V ${y + r} Q ${x},${y} ${x + r},${y} Z`;
};

const shapes: Record<FrameShape, ShapeDef> = {
  // Black acetate square — the classic optical frame (reference style).
  acetateSquare: {
    lens: (cx) => roundedRect(cx, 104, 66, 14),
    bridge: `M ${LEFT_CX + 52},${Y - 14} Q 150,${Y - 22} ${RIGHT_CX - 52},${Y - 14}`,
    rimWidth: 9,
    material: "acetate",
    hingeY: Y - 16,
  },
  // Thin black metal square.
  metalSquare: {
    lens: (cx) => roundedRect(cx, 104, 64, 11),
    bridge: `M ${LEFT_CX + 52},${Y - 12} Q 150,${Y - 21} ${RIGHT_CX - 52},${Y - 12}`,
    rimWidth: 4,
    material: "metal",
    hingeY: Y - 14,
  },
  opticalSquare: {
    lens: (cx) => roundedRect(cx, 104, 64, 12),
    bridge: `M ${LEFT_CX + 52},${Y - 12} L ${RIGHT_CX - 52},${Y - 12}`,
    rimWidth: 8,
    material: "acetate",
    hingeY: Y - 14,
  },
  wayfarer: {
    lens: (cx) =>
      `M ${cx - 50},${Y - 22} Q ${cx - 52},${Y - 34} ${cx - 34},${Y - 34} L ${cx + 34},${Y - 34} Q ${cx + 52},${Y - 34} ${cx + 50},${Y - 20} L ${cx + 42},${Y + 28} Q ${cx + 38},${Y + 38} ${cx + 24},${Y + 38} L ${cx - 24},${Y + 38} Q ${cx - 38},${Y + 38} ${cx - 42},${Y + 26} Z`,
    bridge: `M ${LEFT_CX + 48},${Y - 20} Q 150,${Y - 30} ${RIGHT_CX - 48},${Y - 20}`,
    rimWidth: 9,
    material: "acetate",
    hingeY: Y - 22,
  },
  rectangle: {
    lens: (cx) => roundedRect(cx, 96, 56, 8),
    bridge: `M ${LEFT_CX + 48},${Y - 10} Q 150,${Y - 18} ${RIGHT_CX - 48},${Y - 10}`,
    rimWidth: 5,
    material: "metal",
    hingeY: Y - 10,
  },
  oversized: {
    lens: (cx) => roundedRect(cx, 108, 86, 26),
    bridge: `M ${LEFT_CX + 54},${Y - 22} Q 150,${Y - 32} ${RIGHT_CX - 54},${Y - 22}`,
    rimWidth: 8,
    material: "acetate",
    hingeY: Y - 24,
  },
  round: {
    lens: (cx) =>
      `M ${cx - 45},${Y} A 45,45 0 1,1 ${cx + 45},${Y} A 45,45 0 1,1 ${cx - 45},${Y} Z`,
    bridge: `M ${LEFT_CX + 44},${Y - 8} Q 150,${Y - 20} ${RIGHT_CX - 44},${Y - 8}`,
    rimWidth: 5,
    material: "metal",
    hingeY: Y - 12,
  },
  catEye: {
    lens: (cx) => {
      const dir = cx < 150 ? -1 : 1;
      return `M ${cx + dir * 46},${Y + 6} C ${cx + dir * 50},${Y - 24} ${cx + dir * 30},${Y - 42} ${cx - dir * 4},${Y - 38} C ${cx - dir * 34},${Y - 35} ${cx - dir * 48},${Y - 16} ${cx - dir * 44},${Y + 12} C ${cx - dir * 40},${Y + 34} ${cx - dir * 18},${Y + 44} ${cx + dir * 10},${Y + 42} C ${cx + dir * 34},${Y + 40} ${cx + dir * 42},${Y + 26} ${cx + dir * 46},${Y + 6} Z`;
    },
    bridge: `M ${LEFT_CX + 44},${Y - 16} Q 150,${Y - 26} ${RIGHT_CX - 44},${Y - 16}`,
    rimWidth: 8,
    material: "acetate",
    hingeY: Y - 20,
  },
  // Teardrop: broad, near-flat top tapering to a soft point low and slightly
  // outboard — the defining aviator silhouette.
  aviator: {
    lens: (cx) => {
      const dir = cx < 150 ? -1 : 1;
      return [
        `M ${cx - dir * 43},${Y - 29}`,
        `C ${cx - dir * 20},${Y - 38} ${cx + dir * 25},${Y - 38} ${cx + dir * 46},${Y - 27}`,
        `C ${cx + dir * 50},${Y - 2} ${cx + dir * 40},${Y + 24} ${cx + dir * 14},${Y + 37}`,
        `C ${cx + dir * 2},${Y + 43} ${cx - dir * 22},${Y + 42} ${cx - dir * 36},${Y + 22}`,
        `C ${cx - dir * 44},${Y + 10} ${cx - dir * 46},${Y - 16} ${cx - dir * 43},${Y - 29}`,
        "Z",
      ].join(" ");
    },
    bridge: `M ${LEFT_CX + 44},${Y - 14} Q 150,${Y - 2} ${RIGHT_CX - 44},${Y - 14}`,
    rimWidth: 4.5,
    material: "metal",
    hingeY: Y - 26,
    // Straight brow bar across the top, the aviator's second defining feature.
    extra: (rimPaint, rimWidth) =>
      `<path d="M ${LEFT_CX - 40},${Y - 33} Q 150,${Y - 41} ${RIGHT_CX + 40},${Y - 33}" fill="none" stroke="${rimPaint}" stroke-width="${rimWidth}" stroke-linecap="round"/>`,
  },
  sport: {
    lens: (cx) => {
      const dir = cx < 150 ? -1 : 1;
      return `M ${cx + dir * 50},${Y + 4} C ${cx + dir * 54},${Y - 30} ${cx + dir * 10},${Y - 42} ${cx - dir * 30},${Y - 30} C ${cx - dir * 46},${Y - 24} ${cx - dir * 50},${Y - 4} ${cx - dir * 46},${Y + 14} C ${cx - dir * 42},${Y + 34} ${cx - dir * 14},${Y + 44} ${cx + dir * 16},${Y + 40} C ${cx + dir * 40},${Y + 36} ${cx + dir * 48},${Y + 24} ${cx + dir * 50},${Y + 4} Z`;
    },
    bridge: `M ${LEFT_CX + 48},${Y - 22} Q 150,${Y - 30} ${RIGHT_CX - 48},${Y - 22}`,
    rimWidth: 6,
    material: "acetate",
    hingeY: Y - 20,
  },
};

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

/** Lightens a hex colour toward white by `amount` (0..1). */
function lighten(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function darken(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const mix = (c: number) => Math.round(c * (1 - amount));
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function defs(p: FrameStyleParams, def: ShapeDef): string {
  const metal = p.templeColor ?? (def.material === "metal" ? p.color : "#c3c7cc");
  return `
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${lighten(p.color, 0.34)}"/>
      <stop offset="38%" stop-color="${p.color}"/>
      <stop offset="100%" stop-color="${darken(p.color, 0.45)}"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${lighten(metal, 0.55)}"/>
      <stop offset="35%" stop-color="${metal}"/>
      <stop offset="60%" stop-color="${darken(metal, 0.3)}"/>
      <stop offset="100%" stop-color="${lighten(metal, 0.25)}"/>
    </linearGradient>
    <linearGradient id="glass" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="${lighten(p.lensColor, 0.14)}" stop-opacity="${Math.min(p.lensOpacity * 1.12, 1)}"/>
      <stop offset="55%" stop-color="${p.lensColor}" stop-opacity="${p.lensOpacity}"/>
      <stop offset="100%" stop-color="${darken(p.lensColor, 0.16)}" stop-opacity="${Math.min(p.lensOpacity * 1.05, 1)}"/>
    </linearGradient>
    <clipPath id="tophalf">
      <rect x="0" y="0" width="${FRAME_VIEWBOX_WIDTH}" height="${Y - 2}"/>
    </clipPath>
  </defs>`;
}

/** Specular streak across a lens, suggesting glass. */
function lensSheen(cx: number, opacity: number): string {
  return `<path d="M ${cx - 34},${Y + 20} L ${cx - 6},${Y - 26}" stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
}

function build(shape: FrameShape, p: FrameStyleParams): string {
  const def = shapes[shape] ?? shapes.acetateSquare;
  const isMetal = def.material === "metal";
  const rimPaint = isMetal ? "url(#metal)" : "url(#rim)";
  const hingeY = def.hingeY ?? Y - 14;
  const templePaint = "url(#metal)";
  const templeWidth = isMetal ? 3 : 3.4;

  const lensL = def.lens(LEFT_CX);
  const lensR = def.lens(RIGHT_CX);

  return `
  ${defs(p, def)}
  <g>
    <!-- temples, behind the front -->
    <path d="M ${LEFT_CX - 52},${hingeY} L 4,${hingeY - 12}" stroke="${templePaint}" stroke-width="${templeWidth}" stroke-linecap="round" fill="none"/>
    <path d="M ${RIGHT_CX + 52},${hingeY} L 296,${hingeY - 12}" stroke="${templePaint}" stroke-width="${templeWidth}" stroke-linecap="round" fill="none"/>

    <!-- optical glass -->
    <path d="${lensL}" fill="url(#glass)"/>
    <path d="${lensR}" fill="url(#glass)"/>
    ${lensSheen(LEFT_CX, Math.max(0.1, 0.3 - p.lensOpacity * 0.2))}
    ${lensSheen(RIGHT_CX, Math.max(0.1, 0.3 - p.lensOpacity * 0.2))}

    <!-- rim -->
    <path d="${lensL}" fill="none" stroke="${rimPaint}" stroke-width="${def.rimWidth}" stroke-linejoin="round"/>
    <path d="${lensR}" fill="none" stroke="${rimPaint}" stroke-width="${def.rimWidth}" stroke-linejoin="round"/>

    <!-- specular highlight along the top of the rim -->
    <g clip-path="url(#tophalf)" opacity="0.5">
      <path d="${lensL}" fill="none" stroke="#ffffff" stroke-width="${def.rimWidth * 0.3}" stroke-linejoin="round" transform="translate(0,-${def.rimWidth * 0.26})"/>
      <path d="${lensR}" fill="none" stroke="#ffffff" stroke-width="${def.rimWidth * 0.3}" stroke-linejoin="round" transform="translate(0,-${def.rimWidth * 0.26})"/>
    </g>

    <!-- bridge -->
    <path d="${def.bridge}" fill="none" stroke="${rimPaint}" stroke-width="${def.rimWidth * 0.85}" stroke-linecap="round"/>

    ${def.extra ? def.extra(rimPaint, def.rimWidth) : ""}

    <!-- hinges -->
    <circle cx="${LEFT_CX - 50}" cy="${hingeY}" r="${isMetal ? 3 : 4}" fill="url(#metal)"/>
    <circle cx="${RIGHT_CX + 50}" cy="${hingeY}" r="${isMetal ? 3 : 4}" fill="url(#metal)"/>
  </g>`;
}

export function buildFrameSvgMarkup(shape: FrameShape, params: FrameStyleParams): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME_VIEWBOX_WIDTH} ${FRAME_VIEWBOX_HEIGHT}">${build(
    shape,
    params
  )}</svg>`;
}

export function frameSvgDataUri(shape: FrameShape, params: FrameStyleParams): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildFrameSvgMarkup(shape, params))}`;
}
