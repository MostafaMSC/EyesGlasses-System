/**
 * Reads the colour of a pair of glasses' lenses out of a straight-on product
 * photo — the picture that was given to the 3D generator, not the model it
 * produced, because the generator's lens colour is exactly what can't be
 * trusted.
 *
 * Nothing here needs a model or a library: a product photo is a frame on a
 * plain backdrop, and the lenses are the two smooth patches of colour inside
 * it. The work is in *not* sampling the wrong thing — the rim, the backdrop
 * seen through a clear lens, a specular highlight, a temple arm behind the
 * glass — so the pipeline is: find the frame, find its front, seed one point
 * per lens, grow each into a region that stops at the rim, shrink the region
 * inward so the rim can't bleed in, then take a median so that what is left
 * of a highlight or a logo can't move the answer.
 */

export interface DetectedLensColor {
  /** Representative lens colour, as `#rrggbb`. White for a clear lens. */
  color: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  /**
   * How strongly the lens should be drawn, 0..1 — derived from how much the
   * lens darkens what is behind it, then mapped into the range that keeps a
   * face visible. 0 for a clear lens.
   */
  tintStrength: number;
  /** 0..1. Below `LENS_DETECTION_TRUSTED` (data/products) the admin should pick by hand. */
  confidence: number;
  /** A lens that reads as the backdrop itself has no tint to speak of. */
  kind: "tinted" | "clear";
  /** Plain-language grounds for the score, most important first. */
  reasons: string[];
  /** Where the lenses were found, in the coordinates of the analysed image. */
  regions: { left: Box | null; right: Box | null };
  /** Size of the analysed (downscaled) image, for drawing `regions` over it. */
  analysed: { width: number; height: number };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Longest side the photo is reduced to before analysis. Plenty for colour; keeps every pass fast. */
export const ANALYSIS_MAX_SIZE = 600;

/** Lens centres as a fraction of the front's width — same as the frame-photo pipeline. */
const FRONT_LENS_SPAN = 0.53;
/** RGB distance from the backdrop for a pixel to count as part of the frame. */
const BACKDROP_TOLERANCE = 40;
/** Alpha below which a pixel of a transparent PNG is background. */
const TRANSPARENT_ALPHA = 30;
/** Neighbour-to-reference RGB distance the lens fill may span. */
const FILL_TOLERANCE = 38;
/** Luminance gradient the fill will not cross — the rim's edge. */
const EDGE_THRESHOLD = 60;
/** A grown region larger than this share of the front is a leak into the frame. */
const MAX_REGION_SHARE = 0.4;
const MIN_REGION_SHARE = 0.01;
/** Bright and colourless: a highlight, not the glass. */
const HIGHLIGHT_MIN_CHANNEL = 225;
const HIGHLIGHT_MAX_SPREAD = 20;
/** Samples this close to the frame's own colour are rim, not lens. */
const FRAME_TOLERANCE = 20;
/** Share of highlight samples above which the lens is simply clear. */
const CLEAR_SHARE = 0.7;
/** Map from measured darkening to drawn opacity. */
const TINT_BASE = 0.05;
const TINT_SLOPE = 0.35;
const TINT_MAX = 0.4;

type RGB = [number, number, number];

function luminance([r, g, b]: RGB): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function distance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianColor(samples: RGB[]): RGB {
  return [median(samples.map((s) => s[0])), median(samples.map((s) => s[1])), median(samples.map((s) => s[2]))];
}

function toHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

function toHsl([r, g, b]: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Pixel helpers over one RGBA buffer. */
class Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
  rgb(i: number): RGB {
    const o = i * 4;
    return [this.data[o], this.data[o + 1], this.data[o + 2]];
  }
  alpha(i: number): number {
    return this.data[i * 4 + 3];
  }
  index(x: number, y: number): number {
    return y * this.width + x;
  }
}

function borderMedian(px: Pixels): RGB {
  const samples: RGB[] = [];
  const step = Math.max(1, Math.floor(Math.min(px.width, px.height) / 40));
  for (let x = 0; x < px.width; x += step) {
    samples.push(px.rgb(px.index(x, 0)), px.rgb(px.index(x, px.height - 1)));
  }
  for (let y = 0; y < px.height; y += step) {
    samples.push(px.rgb(px.index(0, y)), px.rgb(px.index(px.width - 1, y)));
  }
  return medianColor(samples);
}

/** Sobel magnitude of luminance, 0..~1440 scaled down to the 0..255 range. */
function edgeMap(px: Pixels): Float32Array {
  const { width, height } = px;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) lum[i] = luminance(px.rgb(i));
  const edges = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -lum[i - width - 1] + lum[i - width + 1] - 2 * lum[i - 1] + 2 * lum[i + 1] - lum[i + width - 1] + lum[i + width + 1];
      const gy =
        -lum[i - width - 1] - 2 * lum[i - width] - lum[i - width + 1] + lum[i + width - 1] + 2 * lum[i + width] + lum[i + width + 1];
      edges[i] = Math.hypot(gx, gy) / 4;
    }
  }
  return edges;
}

function contentBox(mask: Uint8Array, width: number, height: number): Box | null {
  // A row or column needs a few pixels before it counts, so a stray speck
  // of dust on the backdrop can't stretch the box.
  const rows = new Int32Array(height);
  const cols = new Int32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const span = (counts: Int32Array): [number, number] | null => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] < 3) continue;
      if (first < 0) first = i;
      last = i;
    }
    return first < 0 ? null : [first, last];
  };
  const xs = span(cols);
  const ys = span(rows);
  if (!xs || !ys) return null;
  return { x: xs[0], y: ys[0], w: xs[1] - xs[0] + 1, h: ys[1] - ys[0] + 1 };
}

/**
 * The front of the frame, without the temple arms: the front is tall (a
 * whole lens per column), the arms are thin bars, so keeping only the
 * columns that reach a good share of the tallest column isolates it.
 */
function frontBox(mask: Uint8Array, width: number, content: Box): Box {
  const heights = new Int32Array(content.w);
  for (let x = 0; x < content.w; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = content.y; y < content.y + content.h; y++) {
      if (!mask[y * width + content.x + x]) continue;
      if (top < 0) top = y;
      bottom = y;
    }
    heights[x] = top < 0 ? 0 : bottom - top + 1;
  }
  let ref = 0;
  for (const h of heights) ref = Math.max(ref, h);
  if (ref < 8) return content;
  const threshold = ref * 0.4;
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < content.w; x++) {
    if (heights[x] < threshold) continue;
    if (x0 < 0) x0 = x;
    x1 = x;
  }
  if (x0 < 0 || x1 - x0 < 8) return content;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let x = x0; x <= x1; x++) {
    for (let y = content.y; y < content.y + content.h; y++) {
      if (!mask[y * width + content.x + x]) continue;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x: content.x + x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Nudges a nominal lens centre onto the smoothest nearby patch. A lens
 * interior is flat colour; the rim, a hinge, or the edge of a logo are not,
 * so the lowest local variance near the expected centre is the safest place
 * to start growing from.
 */
function refineSeed(px: Pixels, nominalX: number, nominalY: number, radius: number): { x: number; y: number } {
  let best = { x: nominalX, y: nominalY };
  let bestScore = Infinity;
  const step = Math.max(1, Math.round(radius / 6));
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = Math.round(nominalX + dx);
      const y = Math.round(nominalY + dy);
      if (x < 3 || y < 3 || x >= px.width - 3 || y >= px.height - 3) continue;
      if (px.alpha(px.index(x, y)) < TRANSPARENT_ALPHA) continue;
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let wy = -3; wy <= 3; wy++) {
        for (let wx = -3; wx <= 3; wx++) {
          const l = luminance(px.rgb(px.index(x + wx, y + wy)));
          sum += l;
          sumSq += l * l;
          n++;
        }
      }
      const variance = sumSq / n - (sum / n) ** 2;
      // Distance from the nominal point breaks ties toward the expected centre.
      const score = variance + Math.hypot(dx, dy) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function windowMedian(px: Pixels, x: number, y: number): RGB {
  const samples: RGB[] = [];
  for (let wy = -3; wy <= 3; wy++) {
    for (let wx = -3; wx <= 3; wx++) {
      const sx = Math.min(px.width - 1, Math.max(0, x + wx));
      const sy = Math.min(px.height - 1, Math.max(0, y + wy));
      samples.push(px.rgb(px.index(sx, sy)));
    }
  }
  return medianColor(samples);
}

interface Region {
  mask: Uint8Array;
  area: number;
  box: Box;
  cx: number;
  cy: number;
}

/**
 * Grows a lens region from a seed: neighbours within a colour tolerance of the
 * seed patch's colour, never across a strong edge, never outside the front.
 * Tolerance to the *seed* rather than step-to-step, so a gradient can't walk
 * the fill out of the lens and into a similarly-coloured rim.
 */
function growRegion(px: Pixels, edges: Float32Array, seedX: number, seedY: number, reference: RGB, bounds: Box, tolerance: number): Region | null {
  const { width } = px;
  const mask = new Uint8Array(px.width * px.height);
  const queue: number[] = [px.index(seedX, seedY)];
  mask[queue[0]] = 1;
  let area = 0;
  let x0 = seedX;
  let x1 = seedX;
  let y0 = seedY;
  let y1 = seedY;
  let sx = 0;
  let sy = 0;
  const limit = bounds.w * bounds.h * MAX_REGION_SHARE;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    area++;
    sx += x;
    sy += y;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    if (area > limit) return null;
    const neighbours = [i - 1, i + 1, i - width, i + width];
    for (let k = 0; k < 4; k++) {
      const j = neighbours[k];
      const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
      const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
      if (nx < bounds.x || ny < bounds.y || nx >= bounds.x + bounds.w || ny >= bounds.y + bounds.h) continue;
      if (mask[j]) continue;
      if (px.alpha(j) < TRANSPARENT_ALPHA) continue;
      if (edges[j] > EDGE_THRESHOLD) continue;
      if (distance(px.rgb(j), reference) > tolerance) continue;
      mask[j] = 1;
      queue.push(j);
    }
  }
  return { mask, area, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, cx: sx / area, cy: sy / area };
}

/** The region's pixels at least `iterations` steps from its boundary. */
function erode(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  let current = mask;
  for (let k = 0; k < iterations; k++) {
    const next = new Uint8Array(current.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (current[i] && current[i - 1] && current[i + 1] && current[i - width] && current[i + width]) next[i] = 1;
      }
    }
    current = next;
  }
  return current;
}

function isHighlight([r, g, b]: RGB): boolean {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= HIGHLIGHT_MIN_CHANNEL && max - min <= HIGHLIGHT_MAX_SPREAD;
}

function failure(reason: string, analysed: { width: number; height: number }): DetectedLensColor {
  return {
    color: "#ffffff",
    rgb: { r: 255, g: 255, b: 255 },
    hsl: { h: 0, s: 0, l: 100 },
    tintStrength: 0,
    confidence: 0,
    kind: "clear",
    reasons: [reason],
    regions: { left: null, right: null },
    analysed,
  };
}

/**
 * Detects the lens colour in RGBA pixel data of a front-on product photo. The
 * image should already be reduced to `ANALYSIS_MAX_SIZE` (see
 * `detectLensColorFromImage`). Never throws: a photo it can't read comes back
 * with confidence 0 and a reason.
 */
export function detectLensColorFromPixels(data: Uint8ClampedArray, width: number, height: number): DetectedLensColor {
  const px = new Pixels(data, width, height);
  const analysed = { width, height };
  if (width < 16 || height < 16) return failure("The picture is too small to analyse.", analysed);

  // --- What is frame and what is backdrop -----------------------------
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 200) {
      transparent = true;
      break;
    }
  }
  const backdrop: RGB | null = transparent ? null : borderMedian(px);
  const content = new Uint8Array(width * height);
  for (let i = 0; i < content.length; i++) {
    content[i] = transparent
      ? px.alpha(i) >= TRANSPARENT_ALPHA
        ? 1
        : 0
      : distance(px.rgb(i), backdrop!) > BACKDROP_TOLERANCE
      ? 1
      : 0;
  }
  const bbox = contentBox(content, width, height);
  if (!bbox || bbox.w < 24 || bbox.h < 8) return failure("No frame stands out from the backdrop.", analysed);
  const front = frontBox(content, width, bbox);
  const edges = edgeMap(px);

  // --- One region per lens -------------------------------------------
  const nominalY = front.y + front.h / 2;
  const searchRadius = Math.max(3, Math.round(front.w * 0.05));
  const grown: Array<{ region: Region | null; hole: boolean }> = [];
  for (const side of [-1, 1]) {
    const nominalX = front.x + front.w * (0.5 + (side * FRONT_LENS_SPAN) / 2);
    const nominalIndex = px.index(Math.round(nominalX), Math.round(nominalY));
    // A transparent PNG whose lens has been cut out: nothing to sample, and
    // that is itself the answer — the lens is clear.
    if (transparent && px.alpha(nominalIndex) < TRANSPARENT_ALPHA) {
      grown.push({ region: null, hole: true });
      continue;
    }
    const seed = refineSeed(px, nominalX, nominalY, searchRadius);
    const reference = windowMedian(px, seed.x, seed.y);
    // Grown within the front plus a small margin, so a rim that is thin at
    // one point can't let the fill escape down a temple arm.
    const margin = Math.round(front.w * 0.05);
    const bounds: Box = {
      x: Math.max(0, front.x - margin),
      y: Math.max(0, front.y - margin),
      w: Math.min(width, front.x + front.w + margin) - Math.max(0, front.x - margin),
      h: Math.min(height, front.y + front.h + margin) - Math.max(0, front.y - margin),
    };
    let region = growRegion(px, edges, seed.x, seed.y, reference, bounds, FILL_TOLERANCE);
    // A leak into the frame: the seed's colour is too close to the rim's.
    // Tighter tolerance usually stays inside; if not, give this side up.
    if (!region) region = growRegion(px, edges, seed.x, seed.y, reference, bounds, FILL_TOLERANCE * 0.6);
    if (region) {
      const share = region.area / (front.w * front.h);
      const aspect = region.box.w / Math.max(1, region.box.h);
      const centred = Math.abs(region.cx - nominalX) < front.w * 0.2;
      if (share < MIN_REGION_SHARE || aspect < 0.45 || aspect > 2.4 || !centred) region = null;
    }
    grown.push({ region, hole: false });
  }

  const holes = grown.filter((g) => g.hole).length;
  if (holes === 2) {
    return {
      ...failure("", analysed),
      confidence: 0.9,
      reasons: ["Both lens openings are transparent in the picture: a clear lens."],
      regions: { left: null, right: null },
    };
  }

  const valid = grown.filter((g) => g.region).map((g) => g.region!);
  if (valid.length === 0) {
    return failure(
      "Could not isolate a lens on either side — the lens may be the same colour as the rim, or the photo isn't a straight-on front view.",
      analysed
    );
  }

  // --- Sample the interior of each lens --------------------------------
  // The frame's own colour, for rejecting rim pixels that survived the fill:
  // everything in the front that isn't lens.
  const frameSamples: RGB[] = [];
  const frameStep = Math.max(1, Math.floor(Math.sqrt((front.w * front.h) / 4000)));
  for (let y = front.y; y < front.y + front.h; y += frameStep) {
    for (let x = front.x; x < front.x + front.w; x += frameStep) {
      const i = px.index(x, y);
      if (!content[i] || valid.some((r) => r.mask[i])) continue;
      frameSamples.push(px.rgb(i));
    }
  }
  const frameColor = frameSamples.length ? medianColor(frameSamples) : null;

  const reasons: string[] = [];
  const perSide: RGB[] = [];
  let highlightShare = 0;
  let keptShare = 1;
  for (const region of valid) {
    const inset = Math.min(12, Math.max(1, Math.round(region.box.w * 0.1)));
    let interior = erode(region.mask, width, height, inset);
    let count = 0;
    for (let i = 0; i < interior.length; i++) count += interior[i];
    if (count < 50) interior = erode(region.mask, width, height, 1);

    const all: RGB[] = [];
    for (let i = 0; i < interior.length; i++) if (interior[i]) all.push(px.rgb(i));
    const highlights = all.filter(isHighlight).length;
    highlightShare = Math.max(highlightShare, highlights / Math.max(1, all.length));
    let kept = all.filter((s) => !isHighlight(s));
    if (frameColor) {
      const notRim = kept.filter((s) => distance(s, frameColor) > FRAME_TOLERANCE);
      // A black frame with a near-black lens would lose everything here;
      // the rim guard only applies when it leaves most of the lens standing.
      if (notRim.length >= kept.length * 0.5) kept = notRim;
    }
    keptShare = Math.min(keptShare, kept.length / Math.max(1, all.length));
    if (kept.length >= 20) perSide.push(medianColor(kept));
  }

  const reference: RGB = backdrop && luminance(backdrop) >= 160 ? backdrop : [255, 255, 255];
  if (highlightShare >= CLEAR_SHARE && luminance(reference) >= 200) {
    return {
      ...failure("", analysed),
      confidence: valid.length === 2 ? 0.85 : 0.5,
      reasons: ["The lens interior is as bright as the backdrop: a clear lens with no visible tint."],
      regions: { left: grown[0].region?.box ?? null, right: grown[1].region?.box ?? null },
    };
  }
  if (perSide.length === 0) {
    return failure("The lens regions held nothing but highlights and rim.", analysed);
  }

  // --- The answer, and how far to trust it -----------------------------
  const color: RGB = perSide.length === 2 ? [0, 1, 2].map((c) => (perSide[0][c] + perSide[1][c]) / 2) as RGB : perSide[0];
  const darkening = Math.min(1, Math.max(0, 1 - luminance(color) / Math.max(1, luminance(reference))));
  const tintStrength = Math.round(Math.min(TINT_MAX, Math.max(TINT_BASE, TINT_BASE + TINT_SLOPE * darkening)) * 100) / 100;

  let confidence = perSide.length === 2 ? 0.92 : 0.45;
  if (perSide.length === 2) {
    const agreement = distance(perSide[0], perSide[1]);
    if (agreement <= 20) reasons.push(`Both lenses read the same colour (${toHex(perSide[0])} / ${toHex(perSide[1])}).`);
    else if (agreement <= 40) {
      confidence *= 0.8;
      reasons.push(`The two lenses differ somewhat (${toHex(perSide[0])} vs ${toHex(perSide[1])}).`);
    } else {
      confidence *= 0.5;
      reasons.push(`The two lenses disagree (${toHex(perSide[0])} vs ${toHex(perSide[1])}) — one may be glare or rim.`);
    }
    const areaRatio = Math.min(valid[0].area, valid[1].area) / Math.max(valid[0].area, valid[1].area);
    if (areaRatio < 0.5) {
      confidence *= 0.7;
      reasons.push("The two lens regions are very different in size.");
    }
  } else {
    reasons.push("Only one lens could be isolated.");
  }
  const expectedArea = front.w * 0.33 * front.h * 0.7 * 0.78;
  const meanArea = valid.reduce((s, r) => s + r.area, 0) / valid.length;
  if (meanArea < expectedArea * 0.25 || meanArea > expectedArea * 2) {
    confidence *= 0.7;
    reasons.push(`The lens region is an unusual size for the frame (${Math.round((meanArea / expectedArea) * 100)}% of the expected area).`);
  }
  if (keptShare < 0.5) {
    confidence *= 0.75;
    reasons.push("Most of the lens interior was highlight or rim-coloured and had to be discarded.");
  }
  if (backdrop && luminance(backdrop) < 160) {
    confidence *= 0.8;
    reasons.push("Dark backdrop: the tint strength is estimated against white and may be off.");
  }
  if (frameColor && distance(color, frameColor) < FRAME_TOLERANCE * 1.5) {
    confidence *= 0.85;
    reasons.push(`The lens colour is close to the frame's (${toHex(frameColor)}); check it isn't the rim.`);
  }
  reasons.unshift(`Sampled the interior of ${valid.length} lens region${valid.length === 1 ? "" : "s"} inside the front of the frame.`);

  const rounded: RGB = [Math.round(color[0]), Math.round(color[1]), Math.round(color[2])];
  return {
    color: toHex(rounded),
    rgb: { r: rounded[0], g: rounded[1], b: rounded[2] },
    hsl: toHsl(rounded),
    tintStrength,
    confidence: Math.round(confidence * 100) / 100,
    kind: "tinted",
    reasons,
    regions: { left: grown[0].region?.box ?? null, right: grown[1].region?.box ?? null },
    analysed,
  };
}

/** Browser entry point: loads a picture (URL, data URL or file) and analyses it. */
export async function detectLensColorFromImage(source: string | Blob): Promise<DetectedLensColor> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not load the picture."));
      el.src = url;
    });
    const scale = Math.min(1, ANALYSIS_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not read the picture.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return detectLensColorFromPixels(data, canvas.width, canvas.height);
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}
