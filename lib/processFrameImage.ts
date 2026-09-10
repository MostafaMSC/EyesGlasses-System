/**
 * Prepares an uploaded frame photo for use as a try-on overlay.
 *
 * Shop photos are almost always shot on a white background as JPG/PNG with no
 * alpha, which would paste a white rectangle over the user's face. This runs
 * entirely in the browser and:
 *
 *   1. removes the background — real ML segmentation (see segmentFrame.ts)
 *      when it can load, falling back to an edge-aware, CIELAB, Otsu-guided
 *      flood fill only if it can't,
 *   2. makes the lens openings glassy rather than opaque,
 *   3. crops away empty margins and detached logos/labels,
 *   4. locates the two lens centres so the overlay lands on the eyes — either
 *      automatically, or from two points the admin user clicks.
 *
 * Step 4 is what makes an arbitrary photo align correctly without hand-tuning.
 */

import { segmentAlpha } from "@/lib/segmentFrame";
import { segmentAlphaServer } from "@/lib/segmentFrameServer";

export interface FrameGeometry {
  aspect: number;
  lensLeftX: number;
  lensRightX: number;
  lensY: number;
}

/** Two points the admin user clicked on the ORIGINAL photo, as 0..1 fractions of its width/height. */
export interface ManualLensSeeds {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
}

interface LensRegion {
  cx: number;
  cy: number;
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ProcessedFrame {
  dataUrl: string;
  geometry: FrameGeometry;
  /** True when the source already had transparency (background left as-is). */
  alreadyTransparent: boolean;
  /** True when two lens openings were found and used for alignment. */
  lensesDetected: boolean;
  /** True when the image was cropped down to the front rim only. */
  templesCropped: boolean;
  /**
   * Set when the background could not be confidently identified (textured,
   * gradient, or non-uniform), so the cutout may still carry backdrop.
   */
  warning?: string;
  width: number;
  height: number;
}

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The background-removed photo *before* the temple arms are cropped off —
 * everything `processFrameImage` needs to pick a crop is already computed
 * (lens positions, the auto-suggested front-rim box, the outer content
 * bounds), but the crop itself hasn't been applied yet. Kept around so a
 * human can pick the crop instead when automatic detection gets it wrong —
 * see `finalizeFrame`.
 */
export interface WorkingFrame {
  dataUrl: string;
  width: number;
  height: number;
  /** Automatically suggested crop (front-rim box, or a profile-based guess). Use as the starting rectangle for a manual trim. */
  autoBox: FrameBox;
  /** Full opaque content bounds — a crop box should never need to go outside this. */
  contentBox: FrameBox;
  /** Detected lens centres, in this image's own pixel coordinates. Null when detection failed. */
  lensCenters: { left: { x: number; y: number }; right: { x: number; y: number } } | null;
  /** Geometry already computed for `autoBox`, reused as-is when finalizing with that same box. */
  autoGeometry: FrameGeometry;
  alreadyTransparent: boolean;
  lensesDetected: boolean;
  warning?: string;
}

const MAX_DIMENSION = 900;
/** Alpha given to lens interiors so eyes show through. */
const LENS_ALPHA = 38;
const OPAQUE_THRESHOLD = 30;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file."));
    };
    img.src = url;
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the working image."));
    img.src = dataUrl;
  });
}

/* ------------------------------------------------------------------ *
 * CIELAB colour space
 *
 * Perceived lightness (L) and colour (a, b) are separated deliberately: a
 * cast shadow on a white backdrop is almost pure ΔL with very little ΔA/ΔB,
 * while an actual material change (rim vs backdrop, lens vs rim) carries real
 * chroma difference. Down-weighting L stops a shadow from reading as "this
 * must be a different object" the way a flat RGB distance does.
 * ------------------------------------------------------------------ */

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  // sRGB -> XYZ (D65)
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;
  const xn = x / 0.95047;
  const yn = y / 1.0;
  const zn = z / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** L, a, b interleaved per pixel — computed once and reused by every pass below. */
function buildLabBuffer(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lab = new Float32Array(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const [L, A, B] = rgbToLab(data[i], data[i + 1], data[i + 2]);
    lab[p * 3] = L;
    lab[p * 3 + 1] = A;
    lab[p * 3 + 2] = B;
  }
  return lab;
}

/** Lightness is down-weighted so shadows (mostly ΔL) read as smaller than a real material change. */
const LAB_L_WEIGHT = 0.5;

function labDistance(lab: Float32Array, p: number, L: number, A: number, B: number): number {
  const i = p * 3;
  return LAB_L_WEIGHT * Math.abs(lab[i] - L) + Math.abs(lab[i + 1] - A) + Math.abs(lab[i + 2] - B);
}

/* ------------------------------------------------------------------ *
 * Sobel edge map
 *
 * Flood fill alone can leak through a thin bright metal rim if it happens to
 * sit close in colour to the backdrop under normal lighting. A structural
 * edge map gives the fill a hard wall to respect regardless of colour
 * similarity — a rim is always a strong luminance edge even when it is a
 * weak colour one.
 * ------------------------------------------------------------------ */

function computeEdgeMagnitude(lab: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  const L = (x: number, y: number) => lab[(y * w + x) * 3];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      const gx = -L(x0, y0) - 2 * L(x0, y) - L(x0, y1) + L(x1, y0) + 2 * L(x1, y) + L(x1, y1);
      const gy = -L(x0, y0) - 2 * L(x, y0) - L(x1, y0) + L(x0, y1) + 2 * L(x, y1) + L(x1, y1);
      mag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

/**
 * A candidate pixel this close to a strong luminance edge is never crossed by
 * a fill, win or lose on colour. Calibrated empirically: low enough to hold a
 * wall at a thin, bright, low-contrast metal rim against a near-white
 * backdrop (tested down to ~25 before it stops helping at all), high enough
 * to ignore ordinary sensor/JPEG noise on a flat background (tested up to
 * +/-3 per channel with no false walls at this threshold).
 */
const SOBEL_EDGE_THRESHOLD = 25;

/* ------------------------------------------------------------------ *
 * Otsu's method
 *
 * Rather than one hand-picked "background tolerance" constant for every
 * photo, this bins every pixel's Lab distance from the sampled background
 * colour into a histogram and finds the threshold that best separates it
 * into two populations (background-like vs foreground-like) by maximising
 * between-class variance — the standard Otsu binarisation algorithm, applied
 * to "distance from background" instead of raw grey level.
 * ------------------------------------------------------------------ */

function otsuThreshold(hist: Float64Array): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let sum = 0;
  for (let t = 0; t < hist.length; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxBetween = 0;
  let threshold = 0;
  for (let t = 0; t < hist.length; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxBetween) {
      maxBetween = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Median colour, in Lab, sampled from many border points rather than just the
 * four corners — a corner landing on a logo, a prop, or a shadow used to
 * throw the whole removal off by itself.
 */
function sampleBackgroundLab(lab: Float32Array, w: number, h: number): [number, number, number] {
  const Ls: number[] = [];
  const As: number[] = [];
  const Bs: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  const sample = (x: number, y: number) => {
    const p = (y * w + x) * 3;
    Ls.push(lab[p]);
    As.push(lab[p + 1]);
    Bs.push(lab[p + 2]);
  };
  for (let x = 0; x < w; x += step) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    sample(0, y);
    sample(w - 1, y);
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return [median(Ls), median(As), median(Bs)];
}

/** Border-sample variance of distance-from-background — the perimeter check for a non-uniform backdrop. */
function borderVariance(lab: Float32Array, w: number, h: number, bg: [number, number, number]): number {
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  const dists: number[] = [];
  const sample = (x: number, y: number) => dists.push(labDistance(lab, y * w + x, bg[0], bg[1], bg[2]));
  for (let x = 0; x < w; x += step) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    sample(0, y);
    sample(w - 1, y);
  }
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
  const variance = dists.reduce((a, b) => a + (b - mean) * (b - mean), 0) / dists.length;
  return Math.sqrt(variance);
}

const BG_CAP_MIN = 35;
const BG_CAP_MAX = 170;
const BG_STEP_BASE = 12;
const BG_STEP_VARIANCE_GAIN = 0.5;
const BG_STEP_MIN = 9;
const BG_STEP_MAX = 34;
/**
 * Fraction of border pixels that must resemble the sampled background colour
 * for the removal to be trusted. Textured or patterned backdrops (a printed
 * backdrop, a wood table, a marbled surface) fail this by design — no flood
 * fill can chroma-key something that was never a flat colour.
 */
const MIN_BORDER_COVERAGE = 0.65;

/**
 * Flood fill inward from every border pixel, clearing the background.
 *
 * Two tolerances (both adaptive, not fixed) control the fill:
 *   - STEP: a candidate must be close to the neighbour that already got
 *     cleared, in Lab space — this lets it follow gradients and soft shadows.
 *     Its size scales with how noisy the border actually is (perimeter
 *     variance check): a flat backdrop gets a tight step, a slightly uneven
 *     one gets a bit more slack.
 *   - GLOBAL CAP: how far a pixel may drift from the original sampled colour
 *     overall, derived per-photo by Otsu-thresholding the whole image's
 *     distance-from-background histogram, rather than one constant that is
 *     too loose for some photos and too tight for others.
 * A Sobel edge map is checked on every step too: a strong luminance edge is
 * never crossed, which is what stops the fill from bleeding through a thin
 * bright rim that happens to be close in colour to the backdrop.
 */
function clearBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  lab: Float32Array,
  edge: Float32Array
): { outside: Uint8Array; borderCoverage: number; bg: [number, number, number]; globalCap: number } {
  const bg = sampleBackgroundLab(lab, w, h);
  const stddev = borderVariance(lab, w, h, bg);

  // Otsu threshold on the whole image's distance-from-background histogram.
  const hist = new Float64Array(256);
  for (let p = 0; p < w * h; p++) {
    const d = Math.min(255, Math.round(labDistance(lab, p, bg[0], bg[1], bg[2])));
    hist[d]++;
  }
  const globalCap = clamp(otsuThreshold(hist), BG_CAP_MIN, BG_CAP_MAX);
  const stepTolerance = clamp(BG_STEP_BASE + stddev * BG_STEP_VARIANCE_GAIN, BG_STEP_MIN, BG_STEP_MAX);

  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  let borderTotal = 0;
  let borderMatched = 0;

  const seedBorder = (x: number, y: number) => {
    borderTotal++;
    const p = y * w + x;
    if (labDistance(lab, p, bg[0], bg[1], bg[2]) > globalCap) return;
    borderMatched++;
    if (outside[p]) return;
    outside[p] = 1;
    stack.push(p);
  };

  const tryPush = (x: number, y: number, refP: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (outside[p]) return;
    if (edge[p] > SOBEL_EDGE_THRESHOLD) return; // hard wall, regardless of colour
    const ri = refP * 3;
    if (labDistance(lab, p, lab[ri], lab[ri + 1], lab[ri + 2]) > stepTolerance) return;
    if (labDistance(lab, p, bg[0], bg[1], bg[2]) > globalCap) return;
    outside[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < w; x++) {
    seedBorder(x, 0);
    seedBorder(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seedBorder(0, y);
    seedBorder(w - 1, y);
  }

  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    tryPush(x + 1, y, p);
    tryPush(x - 1, y, p);
    tryPush(x, y + 1, p);
    tryPush(x, y - 1, p);
  }

  for (let p = 0; p < w * h; p++) {
    if (outside[p]) data[p * 4 + 3] = 0;
  }

  return { outside, borderCoverage: borderTotal > 0 ? borderMatched / borderTotal : 0, bg, globalCap };
}

/**
 * Clears every enclosed, still-background-coloured pocket (gaps around
 * hinges, a sliver of backdrop between a temple and the rim). These are
 * never the lenses — real lenses are handled separately by
 * `growLensRegion`, seeded from their own colour rather than the
 * background's — this pass only mops up incidental holes so they don't sit
 * on the wearer's face as stray background-coloured patches.
 */
function clearIncidentalGaps(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  outside: Uint8Array,
  lab: Float32Array,
  bg: [number, number, number],
  globalCap: number
) {
  const visited = new Uint8Array(w * h);

  for (let start = 0; start < w * h; start++) {
    if (visited[start] || outside[start]) continue;
    if (labDistance(lab, start, bg[0], bg[1], bg[2]) > globalCap) continue;

    const members: number[] = [start];
    visited[start] = 1;
    const stack = [start];

    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      const neighbours = [
        x + 1 < w ? p + 1 : -1,
        x - 1 >= 0 ? p - 1 : -1,
        y + 1 < h ? p + w : -1,
        y - 1 >= 0 ? p - w : -1,
      ];
      for (const n of neighbours) {
        if (n < 0 || visited[n] || outside[n]) continue;
        if (labDistance(lab, n, bg[0], bg[1], bg[2]) > globalCap) continue;
        visited[n] = 1;
        stack.push(n);
        members.push(n);
      }
    }

    for (const p of members) data[p * 4 + 3] = 0;
  }
}

const LENS_STEP_TOLERANCE = 16;
const LENS_GLOBAL_CAP = 48;

/**
 * Grows a lens region from a single seed point using the seed's OWN colour as
 * the reference, not the background's. A real lens is glass-grey, blue-ish,
 * tinted, or carries a bright reflection streak — essentially never the same
 * shade as the backdrop — so this is what actually finds it, where matching
 * against the background colour (the old approach) always failed and left
 * the lens fully opaque at its photographed colour. The same Sobel edge map
 * used for background removal stops growth from crossing into the rim.
 */
function growLensRegion(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  outside: Uint8Array,
  lab: Float32Array,
  edge: Float32Array,
  seedX: number,
  seedY: number
): { region: LensRegion; members: number[] } | null {
  const sx = clamp(Math.round(seedX), 0, w - 1);
  const sy = clamp(Math.round(seedY), 0, h - 1);
  const start = sy * w + sx;
  if (outside[start]) return null;

  const si = start * 3;
  const seedL = lab[si];
  const seedA = lab[si + 1];
  const seedB = lab[si + 2];

  const visited = new Uint8Array(w * h);
  visited[start] = 1;
  const stack = [start];
  const members: number[] = [];
  let area = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;

  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    area++;
    sumX += x;
    sumY += y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    members.push(p);

    const pi = p * 3;
    const neighbours = [
      x + 1 < w ? p + 1 : -1,
      x - 1 >= 0 ? p - 1 : -1,
      y + 1 < h ? p + w : -1,
      y - 1 >= 0 ? p - w : -1,
    ];
    for (const n of neighbours) {
      if (n < 0 || visited[n] || outside[n]) continue;
      if (edge[n] > SOBEL_EDGE_THRESHOLD) continue; // hard wall at the rim
      if (labDistance(lab, n, lab[pi], lab[pi + 1], lab[pi + 2]) > LENS_STEP_TOLERANCE) continue;
      if (labDistance(lab, n, seedL, seedA, seedB) > LENS_GLOBAL_CAP) continue;
      visited[n] = 1;
      stack.push(n);
    }
  }

  return { region: { cx: sumX / area, cy: sumY / area, area, minX, maxX, minY, maxY }, members };
}

/**
 * Lens-centre span as a fraction of the frame front's own width. In the boxing
 * system the centres sit (lens width + bridge) apart inside a front of
 * (2x lens width + bridge + rim), which lands near 0.53 for every size of
 * frame — unlike the front's aspect ratio, which swings with lens depth.
 */
const FRONT_LENS_SPAN = 0.53;

/**
 * A real lens opening is roughly as tall as it is wide, never a thin bar. On
 * a thin-metal frame the rim can carry almost no luminance edge against a
 * bright reflection, so the colour-guided fill in `growLensRegion` can leak
 * straight through it into the hinge and the start of the temple arm — the
 * grown "lens" then measures far wider than tall. That inflates whatever
 * uses its bounding box (the front-rim crop, in particular), letting the
 * temple survive into the final image. This is checked regardless of
 * whether the seed was automatic or a human's click: a leak is an artifact
 * of the fill, not of who pointed at the starting pixel.
 */
const MAX_LENS_REGION_ASPECT = 2.4;

function isLensShaped(r: LensRegion): boolean {
  const width = r.maxX - r.minX;
  const height = r.maxY - r.minY;
  return height > 0 && width / height <= MAX_LENS_REGION_ASPECT;
}

/**
 * Finds both lenses by growing outward from two seed points, then marks
 * exactly the grown pixels — not their bounding box — as translucent glass.
 * Seeds are either the caller's own click points (trusted outright, no
 * pair-plausibility gate — a human already pointed at both lenses) or the
 * front-on, centred FRONT_LENS_SPAN guess (validated with
 * `isPlausibleLensPair`, since it can land on a gap or glare instead).
 */
function detectAndMarkLenses(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  outside: Uint8Array,
  lab: Float32Array,
  edge: Float32Array,
  seeds: { left: { x: number; y: number }; right: { x: number; y: number } },
  trustSeeds: boolean
): LensRegion[] {
  const left = growLensRegion(data, w, h, outside, lab, edge, seeds.left.x, seeds.left.y);
  const right = growLensRegion(data, w, h, outside, lab, edge, seeds.right.x, seeds.right.y);
  if (!left || !right) return [];
  if (!isLensShaped(left.region) || !isLensShaped(right.region)) return [];
  if (!trustSeeds && !isPlausibleLensPair(left.region, right.region)) return [];

  for (const p of left.members) data[p * 4 + 3] = LENS_ALPHA;
  for (const p of right.members) data[p * 4 + 3] = LENS_ALPHA;

  return [left.region, right.region];
}

/** A pixel this bright and this low-saturation reads as a specular highlight/glare, not the lens's own material colour. */
const REFLECTION_MIN_CHANNEL = 220;
const REFLECTION_MAX_SPREAD = 20;

function isReflectionPixel(data: Uint8ClampedArray, i: number): boolean {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= REFLECTION_MIN_CHANNEL && max - min <= REFLECTION_MAX_SPREAD;
}

/**
 * A specular highlight on real glass can be blown out bright enough that a
 * single step from the surrounding mid-tone glass exceeds
 * LENS_STEP_TOLERANCE, even though the highlight is well within
 * LENS_GLOBAL_CAP of the seed overall — growLensRegion stops at that hard
 * edge and leaves the highlight opaque, a solid white fleck sitting inside
 * an otherwise translucent lens. This sweeps each detected lens's own
 * bounding box — never the rim, which sits outside it — for any pixel that
 * still reads as fully opaque and looks like a highlight rather than the
 * glass itself, and pulls it down to the same glass alpha as the rest of the
 * lens so it can never survive as a solid patch over the wearer's eye.
 */
function clearLensReflections(data: Uint8ClampedArray, w: number, h: number, lenses: LensRegion[]) {
  for (const lens of lenses) {
    for (let y = lens.minY; y <= lens.maxY; y++) {
      for (let x = lens.minX; x <= lens.maxX; x++) {
        const p = y * w + x;
        const i = p * 4;
        if (data[i + 3] <= LENS_ALPHA) continue;
        if (isReflectionPixel(data, i)) data[i + 3] = LENS_ALPHA;
      }
    }
  }
}

/**
 * Do these two regions look like the left and right lens of one frame?
 *
 * A mismatched pair (glare splitting one lens in two, a temple gap grown
 * instead of the lens) puts the measured lens centres somewhere that is not
 * the eyes, which then shifts the whole frame sideways on the face.
 */
function isPlausibleLensPair(a: LensRegion, b: LensRegion): boolean {
  const areaRatio = Math.min(a.area, b.area) / Math.max(a.area, b.area);
  const heightA = a.maxY - a.minY;
  const heightB = b.maxY - b.minY;
  const meanHeight = (heightA + heightB) / 2;
  if (meanHeight < 4) return false;

  const heightRatio = Math.min(heightA, heightB) / Math.max(heightA, heightB);
  const onOneLine = Math.abs(a.cy - b.cy) < meanHeight * 0.45;
  return areaRatio > 0.35 && heightRatio > 0.45 && onOneLine;
}

/**
 * Clears opaque islands that are too small, or too far away and too small
 * to matter, to be part of the frame.
 *
 * A frame is normally one connected object — the bridge physically joins
 * both lens rims — so a second island sitting well outside the main body's
 * footprint is usually background the flood fill could not reach: a printed
 * logo elsewhere on the backdrop, a corner watermark, a model-number
 * sticker. Left alone these survive the crop and paint stray marks or whole
 * extra shapes across the wearer's face.
 *
 * The distance check alone is not enough, though: on a delicate rimless or
 * semi-rimless frame the bridge can be a wire thin enough that the fill
 * nicks it, genuinely splitting the two lenses into separate islands of
 * comparable size — that is the other half of the frame, not a logo, and
 * must never be dropped just for sitting outside the "main" island's
 * footprint. A real logo is essentially always much smaller than a lens, so
 * only a *small and distant* island is treated as detached; a large distant
 * one is kept and left for `frontRimBox`/`boundingBox` to span across.
 */
const SPECK_FRACTION = 0.1;
/** How far (as a fraction of the main blob's own size) a detached island may sit and still be considered "attached". */
const DETACHED_MARGIN_FRACTION = 0.6;
/** An island above this fraction of the main one is assumed to be a real part of the frame, never a logo, regardless of distance. */
const DETACHED_MAX_SIZE_FRACTION = 0.5;

function dropDetachedSpecks(data: Uint8ClampedArray, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1);
  const areas: number[] = [];
  const boxes: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
  const stack: number[] = [];

  for (let start = 0; start < w * h; start++) {
    if (label[start] >= 0 || data[start * 4 + 3] <= OPAQUE_THRESHOLD) continue;

    const id = areas.length;
    let area = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    label[start] = id;
    stack.push(start);

    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nb = [
        x + 1 < w ? p + 1 : -1,
        x - 1 >= 0 ? p - 1 : -1,
        y + 1 < h ? p + w : -1,
        y - 1 >= 0 ? p - w : -1,
      ];
      for (const n of nb) {
        if (n < 0 || label[n] >= 0 || data[n * 4 + 3] <= OPAQUE_THRESHOLD) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    areas.push(area);
    boxes.push({ minX, maxX, minY, maxY });
  }

  if (areas.length < 2) return;
  const mainId = areas.indexOf(Math.max(...areas));
  const largest = areas[mainId];
  const mainBox = boxes[mainId];
  const minArea = largest * SPECK_FRACTION;
  const margin = Math.max(mainBox.maxX - mainBox.minX, mainBox.maxY - mainBox.minY) * DETACHED_MARGIN_FRACTION;
  const expanded = {
    minX: mainBox.minX - margin,
    maxX: mainBox.maxX + margin,
    minY: mainBox.minY - margin,
    maxY: mainBox.maxY + margin,
  };

  const overlapsMain = (b: { minX: number; maxX: number; minY: number; maxY: number }) =>
    b.maxX >= expanded.minX && b.minX <= expanded.maxX && b.maxY >= expanded.minY && b.minY <= expanded.maxY;

  for (let p = 0; p < w * h; p++) {
    const id = label[p];
    if (id < 0 || id === mainId) continue;
    const tooSmall = areas[id] < minArea;
    const detached = !overlapsMain(boxes[id]) && areas[id] < largest * DETACHED_MAX_SIZE_FRACTION;
    if (tooSmall || detached) data[p * 4 + 3] = 0;
  }
}

/**
 * A pixel counts as "not convincingly opaque" for gap-closing purposes — a
 * higher bar than OPAQUE_THRESHOLD (which asks "is this background at all?"),
 * because the artifact this targets is a partial haze, not a fully cleared
 * pixel.
 */
const GAP_ALPHA_THRESHOLD = 200;

/**
 * Restores any enclosed, not-fully-opaque pocket that isn't one of the two
 * real lenses back to solid.
 *
 * A thin, bright bridge wire — gold or silver metal against a white studio
 * backdrop — is exactly the low-contrast case both the ML model and the
 * heuristic fill struggle with (see SOBEL_EDGE_THRESHOLD's note on thin
 * bright rims): instead of staying solid, it can come back partially or
 * fully cleared, leaving a translucent haze hanging between the lenses in
 * the final overlay. Real background can never be trapped in a pocket that
 * is fully surrounded by opaque frame pixels, so anything enclosed here
 * that isn't a lens is an artifact of removal, not real content — it gets
 * put back.
 */
function closeEnclosedAlphaGaps(data: Uint8ClampedArray, w: number, h: number, lenses: LensRegion[]) {
  const isGap = (p: number) => data[p * 4 + 3] < GAP_ALPHA_THRESHOLD;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (outside[p] || !isGap(p)) return;
    outside[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  const inLens = (x: number, y: number) =>
    lenses.some((l) => x >= l.minX && x <= l.maxX && y >= l.minY && y <= l.maxY);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (outside[p]) continue; // reachable from the border — real background
      if (!isGap(p)) continue; // already solid
      if (inLens(x, y)) continue; // a real lens, meant to stay translucent
      data[p * 4 + 3] = 255;
    }
  }
}

/**
 * Softens the alpha channel with a small box blur. Background removal produces
 * hard binary edges that read as a cut-out sticker on a face; a one-pixel
 * feather blends the frame into the photo underneath.
 */
function featherAlpha(data: Uint8ClampedArray, w: number, h: number) {
  const alpha = new Uint8ClampedArray(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = data[p * 4 + 3];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      // Only soften boundary pixels, so solid interiors stay fully opaque.
      const a = alpha[p];
      if (a === 0) continue;
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          sum += alpha[ny * w + nx];
          n++;
        }
      }
      const avg = sum / n;
      // Blend toward the neighbourhood average only where it differs a lot,
      // i.e. at edges.
      if (Math.abs(avg - a) > 40) data[p * 4 + 3] = Math.round(a * 0.35 + avg * 0.65);
    }
  }
}

/** Median RGB from many border points — same sampling pattern as sampleBackgroundLab, kept in plain RGB since decontamination below works in the same space the source photo and canvas compositing already use. */
function sampleBackgroundRGB(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const Rs: number[] = [];
  const Gs: number[] = [];
  const Bs: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  const sample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    Rs.push(data[i]);
    Gs.push(data[i + 1]);
    Bs.push(data[i + 2]);
  };
  for (let x = 0; x < w; x += step) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    sample(0, y);
    sample(w - 1, y);
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return [median(Rs), median(Gs), median(Bs)];
}

/**
 * Removes background-colour bleed ("halo") left at partially-transparent
 * edge pixels after segmentation.
 *
 * A photographed edge is rarely a clean step from frame to backdrop — camera
 * anti-aliasing and JPEG compression blend the two right at the boundary —
 * so a pixel the matte correctly marks, say, 40% opaque still holds close to
 * its ORIGINAL blended colour, which sits far closer to the backdrop than to
 * the frame. Composited over a face at that low alpha, the leftover
 * background tint reads as a thin light ring around the frame — alpha alone
 * (what featherAlpha smooths) was never the part carrying that colour.
 *
 * This unmixes each partially-transparent pixel assuming the standard
 * over-compositing model (observed = alpha*fg + (1-alpha)*bg) to recover the
 * frame's own colour, so what little of the edge pixel shows through is
 * frame-coloured rather than backdrop-coloured. Solid interior pixels
 * (alpha ~255) and fully-cleared ones (alpha 0) are left untouched — there's
 * nothing to unmix at either extreme.
 */
function decontaminateEdgeColor(data: Uint8ClampedArray, w: number, h: number, bg: [number, number, number]) {
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const a = data[i + 3];
    if (a <= 0 || a >= 250) continue;
    const af = a / 255;
    for (let c = 0; c < 3; c++) {
      const fg = (data[i + c] - (1 - af) * bg[c]) / af;
      data[i + c] = clamp(Math.round(fg), 0, 255);
    }
  }
}

/**
 * Overwrites fully-transparent pixels' colour with nearby frame colour,
 * spreading outward a few pixels.
 *
 * Alpha 0 doesn't mean a pixel's RGB is never seen: `finalizeFrame` crops
 * and rescales every photo into one shared canvas size, and that resampling
 * blends neighbouring pixels' colour together before alpha is applied. Left
 * as whatever the original backdrop colour was, that blend can reintroduce
 * the exact background-tinted fringe `decontaminateEdgeColor` just removed
 * — this leaves nothing background-coloured nearby for a later resize to
 * blend in.
 */
function extendOpaqueColorIntoTransparency(data: Uint8ClampedArray, w: number, h: number, passes: number) {
  for (let pass = 0; pass < passes; pass++) {
    const alphaSnapshot = new Uint8ClampedArray(w * h);
    for (let p = 0; p < w * h; p++) alphaSnapshot[p] = data[p * 4 + 3];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (alphaSnapshot[p] > 10) continue; // already has real colour of its own

        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        const neighbours: [number, number][] = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of neighbours) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (alphaSnapshot[np] <= 10) continue;
          const ni = np * 4;
          sr += data[ni];
          sg += data[ni + 1];
          sb += data[ni + 2];
          n++;
        }
        if (n === 0) continue;
        const i = p * 4;
        data[i] = Math.round(sr / n);
        data[i + 1] = Math.round(sg / n);
        data[i + 2] = Math.round(sb / n);
      }
    }
  }
}

/**
 * Crop covering just the front of the frame: both lens openings plus the rim
 * around them, excluding the temple arms. Padding is derived from the lens
 * size so it adapts to thin metal and chunky acetate alike, and the result is
 * always clamped to the actual content.
 */
function frontRimBox(
  lenses: LensRegion[],
  content: { x: number; y: number; w: number; h: number }
) {
  const [left, right] = lenses;
  const lensWidth = Math.max(left.maxX - left.minX, right.maxX - right.minX);
  const lensHeight = Math.max(left.maxY - left.minY, right.maxY - right.minY);

  const padX = lensWidth * 0.22;
  const padTop = lensHeight * 0.55; // browline frames carry a thick top bar
  const padBottom = lensHeight * 0.3;

  const x0 = Math.max(content.x, Math.round(left.minX - padX));
  const x1 = Math.min(content.x + content.w, Math.round(right.maxX + padX));
  const y0 = Math.max(content.y, Math.round(Math.min(left.minY, right.minY) - padTop));
  const y1 = Math.min(content.y + content.h, Math.round(Math.max(left.maxY, right.maxY) + padBottom));

  if (x1 - x0 < 8 || y1 - y0 < 8) return content;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Lens openings in an image that already has an alpha channel: transparent
 * regions fully enclosed by the frame. Without this, an already-transparent
 * PNG would skip detection entirely and keep its temple arms.
 */
function findTransparentHoles(data: Uint8ClampedArray, w: number, h: number): LensRegion[] {
  const isClear = (p: number) => data[p * 4 + 3] < OPAQUE_THRESHOLD;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (outside[p] || !isClear(p)) return;
    outside[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  const visited = new Uint8Array(w * h);
  const regions: LensRegion[] = [];

  for (let start = 0; start < w * h; start++) {
    if (visited[start] || outside[start] || !isClear(start)) continue;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    const s = [start];
    visited[start] = 1;

    while (s.length) {
      const p = s.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nb = [
        x + 1 < w ? p + 1 : -1,
        x - 1 >= 0 ? p - 1 : -1,
        y + 1 < h ? p + w : -1,
        y - 1 >= 0 ? p - w : -1,
      ];
      for (const n of nb) {
        if (n < 0 || visited[n] || outside[n] || !isClear(n)) continue;
        visited[n] = 1;
        s.push(n);
      }
    }

    if (area > (w * h) / 800) {
      regions.push({ cx: sumX / area, cy: sumY / area, area, minX, maxX, minY, maxY });
    }
  }

  return regions
    .sort((a, b) => b.area - a.area)
    .slice(0, 2)
    .sort((a, b) => a.cx - b.cx);
}

/**
 * Widest a frame front alone plausibly gets. Only used when the front could
 * not be isolated, and set at the edge of the real range rather than the
 * middle: a shallow front and a deep front with its arms still attached look
 * alike from the aspect ratio, so shrink only what cannot be a front at all.
 */
const WIDEST_FRONT_ASPECT = 3.4;

/**
 * Fallback temple removal when the lens openings can't be found (printed
 * logos and etched model numbers on the lens break the flood fill).
 *
 * The front of a frame is tall — a full lens height per column. Temple arms
 * are thin bars, so their columns are short. Keeping only the columns that
 * reach a good fraction of the tallest column isolates the front.
 */
interface ProfileCrop {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Width of the tall-column run itself, i.e. the frame front without the
   * padding added around it. Zero when the front could not be told apart from
   * the arms, which is the caller's signal that the crop means nothing.
   */
  frontWidth: number;
}

function columnProfileCrop(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  content: { x: number; y: number; w: number; h: number }
): ProfileCrop {
  const heights = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    let minY = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4 + 3] > OPAQUE_THRESHOLD) {
        if (minY < 0) minY = y;
        maxY = y;
      }
    }
    heights[x] = minY < 0 ? 0 : maxY - minY + 1;
  }

  let refHeight = 0;
  for (let x = 0; x < w; x++) if (heights[x] > refHeight) refHeight = heights[x];
  if (refHeight < 8) return { ...content, frontWidth: 0 };

  const threshold = refHeight * 0.4;
  let xMin = -1;
  let xMax = -1;
  for (let x = 0; x < w; x++) {
    if (heights[x] >= threshold) {
      if (xMin < 0) xMin = x;
      xMax = x;
    }
  }
  if (xMin < 0 || xMax - xMin < 8) return { ...content, frontWidth: 0 };

  const padX = Math.round((xMax - xMin) * 0.05);
  const x0 = Math.max(content.x, xMin - padX);
  const x1 = Math.min(content.x + content.w, xMax + padX);

  let y0 = h;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      if (data[(y * w + x) * 4 + 3] > OPAQUE_THRESHOLD) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (y1 <= y0) return { ...content, frontWidth: 0 };

  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, frontWidth: xMax - xMin + 1 };
}

/**
 * Auto-detection can land the two lenses at genuinely different distances
 * from the frame's own centre line — glare eating into one lens, a hinge
 * shadow biasing the other's seed growth — while still passing both
 * `isPlausibleLensPair` and `isPlausibleGeometry`: their tolerances exist for
 * real, mildly-imperfect photos, not to catch every asymmetry. The visible
 * result is the overlay rendering off-centre or hugging one eye instead of
 * both. Recentering the reported span around the exact midpoint (0.5)
 * removes that failure mode outright — it changes only the normalized
 * alignment metadata used to place the overlay, never the crop itself, and
 * is never applied to manual seeds: a human's own two clicks are trusted
 * as-is (see the note at this function's call site).
 */
function enforceLensSymmetry(g: FrameGeometry): FrameGeometry {
  const span = g.lensRightX - g.lensLeftX;
  return { ...g, lensLeftX: 0.5 - span / 2, lensRightX: 0.5 + span / 2 };
}

/**
 * Rejects lens measurements that cannot describe a real pair of glasses.
 *
 * This matters more than it looks: the on-screen size is derived by dividing
 * by the lens span, so a bogus span of, say, 0.06 (which happens on angled
 * photos, where the far lens is foreshortened into the near one) blows the
 * frame up ~15x across the wearer's face. Falling back to neutral defaults is
 * far better than trusting a bad measurement.
 */
function isPlausibleGeometry(g: FrameGeometry): boolean {
  const span = g.lensRightX - g.lensLeftX;
  const midpoint = (g.lensLeftX + g.lensRightX) / 2;
  return (
    Number.isFinite(span) &&
    span >= 0.28 &&
    span <= 0.72 &&
    Math.abs(midpoint - 0.5) <= 0.15 && // lenses roughly centred in the image
    g.lensY >= 0.2 &&
    g.lensY <= 0.8 &&
    Number.isFinite(g.aspect) &&
    g.aspect >= 1.2 && // a frame front is much wider than it is tall...
    g.aspect <= WIDEST_FRONT_ASPECT // ...but not wider than any real front gets, which is what a leaked crop (arms included) looks like
  );
}

function boundingBox(data: Uint8ClampedArray, w: number, h: number) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > OPAQUE_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Same as `boundingBox`, but confined to a region rather than the whole canvas — used to re-tighten an already-cropped box. */
function tightBoxWithin(
  data: Uint8ClampedArray,
  w: number,
  bounds: { x: number; y: number; w: number; h: number }
) {
  let minX = bounds.x + bounds.w;
  let minY = bounds.y + bounds.h;
  let maxX = bounds.x - 1;
  let maxY = bounds.y - 1;
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      if (data[(y * w + x) * 4 + 3] > OPAQUE_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Every processed frame is fit into one fixed canvas so it occupies the same
 * content-to-canvas ratio regardless of its own crop tightness. Real photos
 * arrive shot at every distance and angle; without this, two frames of the
 * same physical size render at visibly different scales in the catalogue
 * simply because one photo's crop happened to carry more empty margin than
 * the other's (`ProductVisual` renders each image at a fixed CSS width, so
 * how much of that width the frame itself occupies depends entirely on how
 * tight its own crop was).
 */
const FINAL_CANVAS_WIDTH = 800;
const FINAL_CANVAS_HEIGHT = 400;
const FINAL_PADDING_FRACTION = 0.05;

/** Seeds derived from the front-on, centred assumption this file relies on throughout — see FRONT_LENS_SPAN. */
function autoSeeds(data: Uint8ClampedArray, w: number, h: number) {
  // Uses the RAW bounding box (before any lens alpha is applied) so the
  // seeds land inside the still-opaque lens interiors.
  const content = boundingBox(data, w, h);
  return {
    left: { x: content.x + content.w * (0.5 - FRONT_LENS_SPAN / 2), y: content.y + content.h * 0.5 },
    right: { x: content.x + content.w * (0.5 + FRONT_LENS_SPAN / 2), y: content.y + content.h * 0.5 },
  };
}

/**
 * Removes the background, preferring the Python ML service's full u2net
 * model (see python-service/README.md) when it's reachable, then the
 * in-browser u2netp model, and falling back to the colour/edge heuristics
 * only if neither model is available (service not running, offline, an old
 * browser, a missing self-hosted asset) — so the tool still works either way
 * instead of hard-failing when ML is unavailable.
 */
async function removeBackground(
  canvas: HTMLCanvasElement,
  data: Uint8ClampedArray,
  w: number,
  h: number
): Promise<{ outside: Uint8Array; warning?: string; usedML: boolean }> {
  const applyMask = (maskAlpha: Uint8ClampedArray) => {
    for (let p = 0; p < w * h; p++) data[p * 4 + 3] = maskAlpha[p];
    const outside = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) outside[p] = data[p * 4 + 3] <= OPAQUE_THRESHOLD ? 1 : 0;
    return outside;
  };

  try {
    const outside = applyMask(await segmentAlphaServer(canvas, w, h));
    return { outside, usedML: true };
  } catch {
    // Expected whenever python-service isn't running — not an error worth
    // logging, just a silent fall-through to the in-browser model.
  }

  try {
    const outside = applyMask(await segmentAlpha(canvas, w, h));
    return { outside, usedML: true };
  } catch (err) {
    console.error("[processFrameImage] ML segmentation unavailable, using heuristic background removal", err);
    const lab = buildLabBuffer(data, w, h);
    const edge = computeEdgeMagnitude(lab, w, h);
    const { outside, borderCoverage, bg, globalCap } = clearBackground(data, w, h, lab, edge);
    clearIncidentalGaps(data, w, h, outside, lab, bg, globalCap);
    const warning =
      borderCoverage < MIN_BORDER_COVERAGE
        ? "الخلفية غير موحّدة (بها نقوش أو تدرّج قوي) فلم تُزَل بالكامل تلقائياً — التقط الصورة على خلفية بيضاء بسيطة لأفضل نتيجة."
        : undefined;
    return { outside, warning, usedML: false };
  }
}

/**
 * Runs background removal and lens detection, but stops short of cropping
 * off the temple arms — that step happens in `assembleFinal`, driven by
 * either `box` computed here or a box a human picked. Splitting the pipeline
 * here is what lets a manual crop reuse everything already computed (lens
 * positions, content bounds) instead of re-running detection from scratch.
 */
export async function prepareWorkingFrame(file: File, manualSeeds?: ManualLensSeeds): Promise<WorkingFrame> {
  const img = await loadImageFromFile(file);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // If the file already has real transparency, trust it.
  let alreadyTransparent = false;
  for (let p = 0; p < w * h; p += 7) {
    if (data[p * 4 + 3] < 200) {
      alreadyTransparent = true;
      break;
    }
  }

  let lenses: LensRegion[] = [];
  let warning: string | undefined;

  if (alreadyTransparent) {
    // Already has an alpha channel: the lens openings are the enclosed
    // transparent regions. This still needs doing — the temple arms have to
    // be cropped off regardless of how the file arrived.
    lenses = findTransparentHoles(data, w, h);
    // A bright glint can locally break an otherwise-transparent lens hole's
    // connectivity in the source alpha, leaving an isolated opaque fleck.
    if (lenses.length === 2) clearLensReflections(data, w, h, lenses);
    // A pre-made transparent PNG can still carry a stray opaque logo/
    // watermark elsewhere in the canvas (e.g. exported from an editor with a
    // brand mark left in a corner) — same cleanup as the ML/heuristic path.
    dropDetachedSpecks(data, w, h);
    closeEnclosedAlphaGaps(data, w, h, lenses);
  } else {
    const { outside, warning: bgWarning, usedML } = await removeBackground(canvas, data, w, h);
    warning = bgWarning;
    const lab = buildLabBuffer(data, w, h);
    const edge = computeEdgeMagnitude(lab, w, h);

    if (manualSeeds) {
      const seeds = {
        left: { x: manualSeeds.leftX * w, y: manualSeeds.leftY * h },
        right: { x: manualSeeds.rightX * w, y: manualSeeds.rightY * h },
      };
      lenses = detectAndMarkLenses(data, w, h, outside, lab, edge, seeds, true);
    } else if (usedML) {
      // A genuinely clear/optical lens already comes back transparent from
      // the model itself — it looks like backdrop, same as a person would
      // see — so try that first, purely topologically, before assuming
      // anything about colour.
      lenses = findTransparentHoles(data, w, h);
      const plausible = lenses.length === 2 && isPlausibleLensPair(lenses[0], lenses[1]);
      if (!plausible) {
        // A tinted/sunglasses lens looks like solid material to the model
        // (it has no notion of "glass"), so it comes back opaque along with
        // the rim — falls through to the same colour-seeded search as the
        // heuristic path, just now confined to an already-accurate ML
        // silhouette instead of having to fight background contamination.
        lenses = detectAndMarkLenses(data, w, h, outside, lab, edge, autoSeeds(data, w, h), false);
      }
    } else {
      lenses = detectAndMarkLenses(data, w, h, outside, lab, edge, autoSeeds(data, w, h), false);
    }

    if (lenses.length === 2) clearLensReflections(data, w, h, lenses);
    dropDetachedSpecks(data, w, h);
    closeEnclosedAlphaGaps(data, w, h, lenses);
    featherAlpha(data, w, h);
    decontaminateEdgeColor(data, w, h, sampleBackgroundRGB(data, w, h));
    extendOpaqueColorIntoTransparency(data, w, h, 3);
  }

  ctx.putImageData(imageData, 0, 0);

  const contentBox = boundingBox(data, w, h);

  // Keep only the front rim. Product photos are shot with the temple arms
  // splayed outward in perspective; overlaid on a face those become pale
  // "wings" across the cheeks, because a flat image can't run them behind the
  // ears. Cropping to the lens span plus the rim removes them at the source.
  let box = contentBox;
  let geometry: FrameGeometry | null = null;
  let lensesDetected = false;
  let lensCenters: WorkingFrame["lensCenters"] = null;

  // A human's two clicks already say "these are the lenses" — re-applying
  // the auto-pairing plausibility gate on top would let a merely-asymmetric
  // real pair (glare shrinking one lens, say) get silently discarded despite
  // being exactly what was pointed at. `isLensShaped`, applied earlier inside
  // `detectAndMarkLenses`, still guards against a leaked/malformed region.
  if (lenses.length === 2 && (manualSeeds || isPlausibleLensPair(lenses[0], lenses[1]))) {
    const candidateBox = frontRimBox(lenses, contentBox);
    let candidate: FrameGeometry = {
      aspect: candidateBox.w / candidateBox.h,
      lensLeftX: (lenses[0].cx - candidateBox.x) / candidateBox.w,
      lensRightX: (lenses[1].cx - candidateBox.x) / candidateBox.w,
      lensY: ((lenses[0].cy + lenses[1].cy) / 2 - candidateBox.y) / candidateBox.h,
    };
    // A human's two clicks already say "these are the lenses" — forcing
    // symmetry on top would override a deliberate, trusted correction.
    if (!manualSeeds) candidate = enforceLensSymmetry(candidate);
    if (isPlausibleGeometry(candidate) || manualSeeds) {
      box = candidateBox;
      geometry = candidate;
      lensesDetected = true;
      lensCenters = {
        left: { x: lenses[0].cx, y: lenses[0].cy },
        right: { x: lenses[1].cx, y: lenses[1].cy },
      };
    }
  }

  // Detection failed or produced nonsense (angled photos, logos printed on the
  // lens). Fall back to a profile-based crop and neutral geometry rather than
  // trusting a bad measurement — a too-small lens span divides into an
  // enormous on-screen frame.
  if (!geometry) {
    const crop = columnProfileCrop(data, w, h, contentBox);
    box = crop;
    const aspect = box.w / box.h;

    // The lens span has to be assumed here, and the on-screen size is the span
    // *divided* by it — so guessing high renders the frame far too small. What
    // the guess needs is the width of the frame front alone, without the
    // temple arms. The column profile measures exactly that, when it can
    // separate them; when it can't, all that is left is the crop's aspect, and
    // only a crop too wide to be any front at all says anything.
    // Both readings are upper bounds on how much of the crop is front, and the
    // profile can be fooled — an arm sweeping down the frame in an angled shot
    // fills a column as tall as the lens — so take whichever is smaller.
    const measured = crop.frontWidth > 0 ? crop.frontWidth / box.w : 1;
    const frontFraction = Math.min(measured, WIDEST_FRONT_ASPECT / aspect, 1);
    const span = clamp(FRONT_LENS_SPAN * frontFraction, 0.18, 0.6);

    geometry = { aspect, lensLeftX: 0.5 - span / 2, lensRightX: 0.5 + span / 2, lensY: 0.5 };
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: w,
    height: h,
    autoBox: box,
    contentBox,
    lensCenters,
    autoGeometry: geometry,
    alreadyTransparent,
    lensesDetected,
    warning,
  };
}

const sameBox = (a: FrameBox, b: FrameBox) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Alpha above which a pixel counts as solid frame material for normalizeContrast. */
const OPAQUE_FOR_CONTRAST = 250;

/**
 * Mild auto-levels stretch on solid frame pixels, so a photo shot under
 * flat/dim admin lighting doesn't sit visibly duller in the catalogue next
 * to one shot under better light.
 *
 * Deliberately conservative in two ways: it only stretches when the photo's
 * own luminance range is genuinely compressed (a normally-exposed photo is
 * left untouched rather than over-processed), and it stretches toward, not
 * all the way to, the full 0-255 range, so a mildly flat photo doesn't get
 * blown out the way a hard stretch would. Only touches fully-opaque pixels
 * — translucent lens interiors and the feathered/decontaminated edge ring
 * are left exactly as those earlier passes produced them. Runs last, on the
 * final assembled canvas, entirely after lens detection and cropping are
 * done, so it can never perturb the Lab/Otsu/Sobel thresholds those steps
 * depend on.
 */
function normalizeContrast(data: Uint8ClampedArray, w: number, h: number) {
  let lo = 255;
  let hi = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] < OPAQUE_FOR_CONTRAST) continue;
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  const range = hi - lo;
  // Skip a photo that's already well-exposed (nothing compressed to fix) and
  // guard against a degenerate near-solid-colour selection either way.
  if (!(range > 5 && range < 180)) return;

  const targetLo = 10;
  const targetHi = 245;
  const scale = (targetHi - targetLo) / range;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] < OPAQUE_FOR_CONTRAST) continue;
    for (let c = 0; c < 3; c++) {
      data[i + c] = clamp(Math.round(targetLo + (data[i + c] - lo) * scale), 0, 255);
    }
  }
}

/** Geometry for an arbitrary crop box, reusing real lens centres when known. */
function geometryForBox(working: WorkingFrame, box: FrameBox): FrameGeometry {
  if (working.lensCenters) {
    return {
      aspect: box.w / box.h,
      lensLeftX: (working.lensCenters.left.x - box.x) / box.w,
      lensRightX: (working.lensCenters.right.x - box.x) / box.w,
      lensY: ((working.lensCenters.left.y + working.lensCenters.right.y) / 2 - box.y) / box.h,
    };
  }
  if (sameBox(box, working.autoBox)) return working.autoGeometry;
  // No detected centres and this isn't the box detection already reasoned
  // about: assume a manual crop was trimmed tight to the front already, so
  // the ordinary centred guess is a reasonable estimate.
  const span = clamp(FRONT_LENS_SPAN, 0.18, 0.6);
  return { aspect: box.w / box.h, lensLeftX: 0.5 - span / 2, lensRightX: 0.5 + span / 2, lensY: 0.5 };
}

/** Crops a working frame to `box`, fits it into the shared final canvas, and re-expresses lens geometry against it. */
export async function finalizeFrame(working: WorkingFrame, box: FrameBox): Promise<ProcessedFrame> {
  const img = await loadImageFromDataUrl(working.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = working.width;
  canvas.height = working.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, working.width, working.height).data;

  const clampedBox: FrameBox = {
    x: clamp(box.x, 0, working.width - 1),
    y: clamp(box.y, 0, working.height - 1),
    w: clamp(box.w, 1, working.width - clamp(box.x, 0, working.width - 1)),
    h: clamp(box.h, 1, working.height - clamp(box.y, 0, working.height - 1)),
  };
  const geometry = geometryForBox(working, clampedBox);

  // Re-tighten within the box (frontRimBox's own padding can be more generous
  // than a given frame actually needs — a thin-rimmed frame doesn't need a
  // browline's full top margin), then pad that by a fixed fraction — not a
  // lens-relative one — and fit it into the one shared canvas size.
  const tight = tightBoxWithin(data, working.width, clampedBox);
  const padX = Math.round(tight.w * FINAL_PADDING_FRACTION);
  const padY = Math.round(tight.h * FINAL_PADDING_FRACTION);
  const paddedX0 = clamp(tight.x - padX, clampedBox.x, clampedBox.x + clampedBox.w);
  const paddedY0 = clamp(tight.y - padY, clampedBox.y, clampedBox.y + clampedBox.h);
  const paddedX1 = clamp(tight.x + tight.w + padX, clampedBox.x, clampedBox.x + clampedBox.w);
  const paddedY1 = clamp(tight.y + tight.h + padY, clampedBox.y, clampedBox.y + clampedBox.h);
  const padded = {
    x: paddedX0,
    y: paddedY0,
    w: Math.max(1, paddedX1 - paddedX0),
    h: Math.max(1, paddedY1 - paddedY0),
  };

  const fitScale = Math.min(FINAL_CANVAS_WIDTH / padded.w, FINAL_CANVAS_HEIGHT / padded.h);
  const drawW = padded.w * fitScale;
  const drawH = padded.h * fitScale;
  const offsetX = (FINAL_CANVAS_WIDTH - drawW) / 2;
  const offsetY = (FINAL_CANVAS_HEIGHT - drawH) / 2;

  const out = document.createElement("canvas");
  out.width = FINAL_CANVAS_WIDTH;
  out.height = FINAL_CANVAS_HEIGHT;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas is unavailable in this browser.");
  outCtx.drawImage(canvas, padded.x, padded.y, padded.w, padded.h, offsetX, offsetY, drawW, drawH);

  const outImageData = outCtx.getImageData(0, 0, FINAL_CANVAS_WIDTH, FINAL_CANVAS_HEIGHT);
  normalizeContrast(outImageData.data, FINAL_CANVAS_WIDTH, FINAL_CANVAS_HEIGHT);
  outCtx.putImageData(outImageData, 0, 0);

  // Re-express the lens geometry against the new fixed canvas: the fractions
  // above are relative to the chosen box, so convert to absolute pixels in
  // the working canvas first, then apply this same crop + scale + centring.
  const toFinalX = (fracOfBox: number) => (clampedBox.x + fracOfBox * clampedBox.w - padded.x) * fitScale + offsetX;
  const toFinalY = (fracOfBox: number) => (clampedBox.y + fracOfBox * clampedBox.h - padded.y) * fitScale + offsetY;
  const finalGeometry: FrameGeometry = {
    aspect: FINAL_CANVAS_WIDTH / FINAL_CANVAS_HEIGHT,
    lensLeftX: toFinalX(geometry.lensLeftX) / FINAL_CANVAS_WIDTH,
    lensRightX: toFinalX(geometry.lensRightX) / FINAL_CANVAS_WIDTH,
    lensY: toFinalY(geometry.lensY) / FINAL_CANVAS_HEIGHT,
  };

  return {
    dataUrl: out.toDataURL("image/png"),
    geometry: finalGeometry,
    alreadyTransparent: working.alreadyTransparent,
    lensesDetected: working.lensesDetected,
    templesCropped: clampedBox.w < working.contentBox.w - 2 || clampedBox.h < working.contentBox.h - 2,
    warning: working.warning,
    width: FINAL_CANVAS_WIDTH,
    height: FINAL_CANVAS_HEIGHT,
  };
}

/** Runs the full automatic pipeline: prepare, then crop to the auto-suggested box. */
export async function processFrameImage(file: File, manualSeeds?: ManualLensSeeds): Promise<ProcessedFrame> {
  const working = await prepareWorkingFrame(file, manualSeeds);
  return finalizeFrame(working, working.autoBox);
}

// --- Side-profile photos (temple arm visible) ---------------------------
//
// A side shot needs the opposite treatment from a front photo: the temple
// arm is the whole point, so there is no lens-pair detection and no
// front-rim crop here — just background removal and a plain content crop.
// Alignment is a single point (`SideOverlayGeometry.anchorX/Y`) placed by a
// human click in the admin panel (see `SeedPicker`'s pattern in
// app/admin/page.tsx) rather than auto-detected; a side photo's framing
// varies too much for that to be worth automating for a first version.

const SIDE_MAX_DIMENSION = 700;
const SIDE_FINAL_WIDTH = 500;
const SIDE_FINAL_HEIGHT = 380;
const SIDE_PADDING_FRACTION = 0.06;

export interface ProcessedSideFrame {
  dataUrl: string;
  width: number;
  height: number;
  alreadyTransparent: boolean;
  warning?: string;
}

/**
 * Removes the background from a side-profile photo and crops it tight to
 * its own content — nothing lens- or arm-specific. Reuses the same
 * `removeBackground` (ML with heuristic fallback) as the front pipeline.
 */
export async function processSideFrameImage(file: File): Promise<ProcessedSideFrame> {
  const img = await loadImageFromFile(file);

  const scale = Math.min(1, SIDE_MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  let alreadyTransparent = false;
  for (let p = 0; p < w * h; p += 7) {
    if (data[p * 4 + 3] < 200) {
      alreadyTransparent = true;
      break;
    }
  }

  let warning: string | undefined;
  if (!alreadyTransparent) {
    const { warning: bgWarning } = await removeBackground(canvas, data, w, h);
    warning = bgWarning;
    dropDetachedSpecks(data, w, h);
    // No lens regions to protect here — any enclosed haze (e.g. a thin
    // bright hinge/bridge sliver, same failure as the front pipeline) is
    // always an artifact, never intentional translucency, for a side photo.
    closeEnclosedAlphaGaps(data, w, h, []);
    featherAlpha(data, w, h);
    decontaminateEdgeColor(data, w, h, sampleBackgroundRGB(data, w, h));
    extendOpaqueColorIntoTransparency(data, w, h, 3);
  }

  ctx.putImageData(imageData, 0, 0);

  const content = boundingBox(data, w, h);
  const padX = Math.round(content.w * SIDE_PADDING_FRACTION);
  const padY = Math.round(content.h * SIDE_PADDING_FRACTION);
  const box = {
    x: Math.max(0, content.x - padX),
    y: Math.max(0, content.y - padY),
    w: Math.min(w, content.w + padX * 2),
    h: Math.min(h, content.h + padY * 2),
  };

  const fitScale = Math.min(SIDE_FINAL_WIDTH / box.w, SIDE_FINAL_HEIGHT / box.h);
  const drawW = box.w * fitScale;
  const drawH = box.h * fitScale;
  const offsetX = (SIDE_FINAL_WIDTH - drawW) / 2;
  const offsetY = (SIDE_FINAL_HEIGHT - drawH) / 2;

  const out = document.createElement("canvas");
  out.width = SIDE_FINAL_WIDTH;
  out.height = SIDE_FINAL_HEIGHT;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas is unavailable in this browser.");
  outCtx.drawImage(canvas, box.x, box.y, box.w, box.h, offsetX, offsetY, drawW, drawH);

  const sideOutImageData = outCtx.getImageData(0, 0, SIDE_FINAL_WIDTH, SIDE_FINAL_HEIGHT);
  normalizeContrast(sideOutImageData.data, SIDE_FINAL_WIDTH, SIDE_FINAL_HEIGHT);
  outCtx.putImageData(sideOutImageData, 0, 0);

  return {
    dataUrl: out.toDataURL("image/png"),
    width: SIDE_FINAL_WIDTH,
    height: SIDE_FINAL_HEIGHT,
    alreadyTransparent,
    warning,
  };
}
