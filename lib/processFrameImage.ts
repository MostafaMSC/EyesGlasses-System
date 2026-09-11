/**
 * Prepares an uploaded frame photo for use as a try-on overlay.
 *
 * The actual pixel work (background removal via a real segmentation model,
 * lens detection, front-rim cropping) runs server-side in the Python
 * microservice at services/frame-processor, reached through the
 * app/api/frame/* proxy routes. This module is a thin client: same
 * exported functions and types as before, now backed by HTTP calls instead
 * of an in-browser pixel pipeline. See services/frame-processor/README.md
 * for why — a hand-rolled client-side heuristic (and, before that, a small
 * in-browser ONNX model) kept struggling with thin bright bridges,
 * reflective lenses, and metal rims leaking into the temple.
 */

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
 * everything needed to pick a crop is already computed (lens positions, the
 * auto-suggested front-rim box, the outer content bounds), but the crop
 * itself hasn't been applied yet. Kept around so a human can pick the crop
 * instead when automatic detection gets it wrong — see `finalizeFrame`.
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

export interface ProcessedSideFrame {
  dataUrl: string;
  width: number;
  height: number;
  alreadyTransparent: boolean;
  warning?: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? "تعذّرت معالجة الصورة.");
  }
  return res.json();
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? "تعذّرت معالجة الصورة.");
  }
  return res.json();
}

/**
 * Runs background removal and lens detection, but stops short of cropping
 * off the temple arms — that step happens in `finalizeFrame`, driven by
 * either the auto-suggested box or one a human picked.
 */
export async function prepareWorkingFrame(file: File, manualSeeds?: ManualLensSeeds): Promise<WorkingFrame> {
  const form = new FormData();
  form.append("file", file);
  if (manualSeeds) form.append("manualSeeds", JSON.stringify(manualSeeds));
  return postForm<WorkingFrame>("/api/frame/prepare", form);
}

/** Crops a working frame to `box`, fits it into the shared final canvas, and re-expresses lens geometry against it. */
export async function finalizeFrame(working: WorkingFrame, box: FrameBox): Promise<ProcessedFrame> {
  return postJson<ProcessedFrame>("/api/frame/finalize", { working, box });
}

/** Runs the full automatic pipeline: prepare, then crop to the auto-suggested box. */
export async function processFrameImage(file: File, manualSeeds?: ManualLensSeeds): Promise<ProcessedFrame> {
  const working = await prepareWorkingFrame(file, manualSeeds);
  return finalizeFrame(working, working.autoBox);
}

/**
 * Removes the background from a side-profile photo and crops it tight to
 * its own content — nothing lens- or arm-specific, since a side photo's
 * whole point is to keep the temple arm visible.
 */
export async function processSideFrameImage(file: File): Promise<ProcessedSideFrame> {
  const form = new FormData();
  form.append("file", file);
  return postForm<ProcessedSideFrame>("/api/frame/side", form);
}
