/**
 * Prepares an uploaded frame photo for use as a try-on overlay.
 *
 * Shop photos are almost always shot on a white background as JPG/PNG with no
 * alpha, which would paste a white rectangle over the user's face. This runs
 * entirely in the browser and:
 *
 *   1. removes the background (flood fill inwards from the edges),
 *   2. makes the enclosed lens areas glassy rather than opaque,
 *   3. crops away empty margins,
 *   4. locates the two lens centres so the overlay lands on the eyes.
 *
 * Step 4 is what makes an arbitrary photo align correctly without hand-tuning.
 */

export interface FrameGeometry {
  aspect: number;
  lensLeftX: number;
  lensRightX: number;
  lensY: number;
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
  width: number;
  height: number;
}

const MAX_DIMENSION = 900;
/** Colour distance (0-255 per channel, summed) treated as "same as background". */
const BG_TOLERANCE = 78;
/** Alpha given to lens interiors so eyes show through. */
const LENS_ALPHA = 38;
const OPAQUE_THRESHOLD = 30;

/**
 * Lens-centre span as a fraction of the frame front's own width. In the boxing
 * system the centres sit (lens width + bridge) apart inside a front of
 * (2x lens width + bridge + rim), which lands near 0.53 for every size of
 * frame â€” unlike the front's aspect ratio, which swings with lens depth.
 */
const FRONT_LENS_SPAN = 0.53;
/**
 * Widest a frame front alone plausibly gets. Only used when the front could
 * not be isolated, and set at the edge of the real range rather than the
 * middle: a shallow front and a deep front with its arms still attached look
 * alike from the aspect ratio, so shrink only what cannot be a front at all.
 */
const WIDEST_FRONT_ASPECT = 3.4;
/**
 * Opaque blobs smaller than this fraction of the largest one are cleared.
 * Flood fill leaves flecks behind wherever the background is uneven (JPEG
 * ringing, a soft shadow under the frame, a reflection on the shooting
 * surface), and on a face those read as scratches floating over the cheek.
 */
const SPECK_FRACTION = 0.1;

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

function colorDistance(
  data: Uint8ClampedArray,
  i: number,
  r: number,
  g: number,
  b: number
): number {
  return Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b);
}

/** Average of the four corner pixels â€” the most likely background colour. */
function sampleBackground(data: Uint8ClampedArray, w: number, h: number) {
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of corners) {
    r += data[c];
    g += data[c + 1];
    b += data[c + 2];
  }
  return { r: r / 4, g: g / 4, b: b / 4 };
}

/**
 * Flood fill inward from every border pixel, clearing anything that matches the
 * background. Working inward (rather than clearing every matching pixel
 * globally) is what preserves light details *inside* the frame.
 */
function clearBackground(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const bg = sampleBackground(data, w, h);
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (outside[p]) return;
    if (colorDistance(data, p * 4, bg.r, bg.g, bg.b) > BG_TOLERANCE) return;
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

  for (let p = 0; p < w * h; p++) {
    if (outside[p]) data[p * 4 + 3] = 0;
  }
  return outside;
}

/**
 * Enclosed background-coloured regions. The two largest are the lens openings:
 * they become translucent glass and give us the alignment points. Every other
 * enclosed pocket (gaps around the hinges, sky showing between the temples and
 * the rim) is cleared completely â€” leaving those translucent puts pale ghost
 * shapes on the wearer's face.
 */
function findLenses(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  outside: Uint8Array
): LensRegion[] {
  const bg = sampleBackground(data, w, h);
  const visited = new Uint8Array(w * h);
  const regions: (LensRegion & { members: number[] })[] = [];

  for (let start = 0; start < w * h; start++) {
    if (visited[start] || outside[start]) continue;
    if (colorDistance(data, start * 4, bg.r, bg.g, bg.b) > BG_TOLERANCE) continue;

    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    const stack = [start];
    visited[start] = 1;
    const members: number[] = [];

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

      const neighbours = [
        x + 1 < w ? p + 1 : -1,
        x - 1 >= 0 ? p - 1 : -1,
        y + 1 < h ? p + w : -1,
        y - 1 >= 0 ? p - w : -1,
      ];
      for (const n of neighbours) {
        if (n < 0 || visited[n] || outside[n]) continue;
        if (colorDistance(data, n * 4, bg.r, bg.g, bg.b) > BG_TOLERANCE) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }

    // Ignore specks; keep anything big enough to be a lens or a real gap.
    if (area > (w * h) / 800) {
      regions.push({ cx: sumX / area, cy: sumY / area, area, minX, maxX, minY, maxY, members });
    }
  }

  const bySize = [...regions].sort((a, b) => b.area - a.area);
  const lenses = bySize.slice(0, 2);
  const lensIds = new Set(lenses);

  for (const region of regions) {
    const alpha = lensIds.has(region) ? LENS_ALPHA : 0;
    for (const p of region.members) data[p * 4 + 3] = alpha;
  }

  return lenses
    .sort((a, b) => a.cx - b.cx)
    .map(({ cx, cy, area, minX, maxX, minY, maxY }) => ({ cx, cy, area, minX, maxX, minY, maxY }));
}

/**
 * Clears opaque islands that are too small to be part of the frame.
 *
 * A frame is one connected object (plus, at most, a detached lens or nose
 * pad), so anything left over that is a fraction of the main body's size is
 * background the flood fill could not reach â€” it survives the crop and paints
 * stray marks across the wearer's face.
 */
function dropDetachedSpecks(data: Uint8ClampedArray, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1);
  const areas: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < w * h; start++) {
    if (label[start] >= 0 || data[start * 4 + 3] <= OPAQUE_THRESHOLD) continue;

    const id = areas.length;
    let area = 0;
    label[start] = id;
    stack.push(start);

    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const x = p % w;
      const y = (p / w) | 0;
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
  }

  if (areas.length < 2) return;
  const largest = Math.max(...areas);
  const minArea = largest * SPECK_FRACTION;
  for (let p = 0; p < w * h; p++) {
    const id = label[p];
    if (id >= 0 && areas[id] < minArea) data[p * 4 + 3] = 0;
  }
}

/**
 * Do these two regions look like the left and right lens of one frame?
 *
 * The largest two enclosed pockets are not always the lenses â€” glare can split
 * one lens in two, and the triangle between a splayed temple and the rim is
 * often bigger than the far lens on an angled shot. A mismatched pair puts the
 * measured lens centres somewhere that is not the eyes, which then shifts the
 * whole frame sideways on the face.
 */
function isPlausibleLensPair(a: LensRegion, b: LensRegion): boolean {
  const areaRatio = Math.min(a.area, b.area) / Math.max(a.area, b.area);
  const heightA = a.maxY - a.minY;
  const heightB = b.maxY - b.minY;
  const meanHeight = (heightA + heightB) / 2;
  if (meanHeight < 4) return false;

  const heightRatio = Math.min(heightA, heightB) / Math.max(heightA, heightB);
  const onOneLine = Math.abs(a.cy - b.cy) < meanHeight * 0.45;
  return areaRatio > 0.4 && heightRatio > 0.5 && onOneLine;
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
 * Fallback temple removal when the lens openings can't be found (printed
 * logos and etched model numbers on the lens break the flood fill).
 *
 * The front of a frame is tall â€” a full lens height per column. Temple arms
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
    g.aspect >= 1.2 // a frame front is much wider than it is tall
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

export async function processFrameImage(file: File): Promise<ProcessedFrame> {
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
  if (alreadyTransparent) {
    // Already has an alpha channel: the lens openings are the enclosed
    // transparent regions. This still needs doing â€” the temple arms have to
    // be cropped off regardless of how the file arrived.
    lenses = findTransparentHoles(data, w, h);
  } else {
    const outside = clearBackground(data, w, h);
    lenses = findLenses(data, w, h, outside);
    dropDetachedSpecks(data, w, h);
    featherAlpha(data, w, h);
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

  if (lenses.length === 2 && isPlausibleLensPair(lenses[0], lenses[1])) {
    const candidateBox = frontRimBox(lenses, contentBox);
    const candidate: FrameGeometry = {
      aspect: candidateBox.w / candidateBox.h,
      lensLeftX: (lenses[0].cx - candidateBox.x) / candidateBox.w,
      lensRightX: (lenses[1].cx - candidateBox.x) / candidateBox.w,
      lensY: ((lenses[0].cy + lenses[1].cy) / 2 - candidateBox.y) / candidateBox.h,
    };
    if (isPlausibleGeometry(candidate)) {
      box = candidateBox;
      geometry = candidate;
      lensesDetected = true;
    }
  }

  // Detection failed or produced nonsense (angled photos, logos printed on the
  // lens). Fall back to a profile-based crop and neutral geometry rather than
  // trusting a bad measurement â€” a too-small lens span divides into an
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

  const out = document.createElement("canvas");
  out.width = box.w;
  out.height = box.h;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas is unavailable in this browser.");
  outCtx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

  return {
    dataUrl: out.toDataURL("image/png"),
    geometry,
    alreadyTransparent,
    lensesDetected,
    templesCropped: lensesDetected && box.w < contentBox.w - 2,
    width: box.w,
    height: box.h,
  };
}
