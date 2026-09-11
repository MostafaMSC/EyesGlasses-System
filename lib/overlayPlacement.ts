import type { FacePose } from "@/lib/faceGeometry";
import type { OverlayGeometry, SideOverlayGeometry, TryOnConfig } from "@/data/products";
import {
  FRAME_EYE_CENTER_Y,
  FRAME_EYE_SPAN,
  FRAME_VIEWBOX_HEIGHT,
  FRAME_VIEWBOX_WIDTH,
} from "@/lib/frameShapes";

/** Geometry of the generated frames, used when a product doesn't override it. */
export const DEFAULT_OVERLAY_GEOMETRY: OverlayGeometry = {
  aspect: FRAME_VIEWBOX_WIDTH / FRAME_VIEWBOX_HEIGHT,
  lensLeftX: (FRAME_VIEWBOX_WIDTH - FRAME_EYE_SPAN) / 2 / FRAME_VIEWBOX_WIDTH,
  lensRightX: (FRAME_VIEWBOX_WIDTH + FRAME_EYE_SPAN) / 2 / FRAME_VIEWBOX_WIDTH,
  lensY: FRAME_EYE_CENTER_Y / FRAME_VIEWBOX_HEIGHT,
};

export interface OverlayPlacement {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  /** In-plane rotation (head tilt). */
  rollDeg: number;
  /** Out-of-plane rotations, applied as CSS 3D transforms. */
  yawDeg: number;
  pitchDeg: number;
}

/**
 * `span x aspect` for a real frame, whatever crop it arrives in: widen a crop
 * and the aspect grows exactly as fast as the span fraction shrinks, so the
 * product depends only on the frame itself. Across real frames it runs about
 * 1.18 (a deep oversized front) to 2.17 (a shallow rimless one), centred here.
 */
const FRONT_SPAN_X_ASPECT = 1.65;
/**
 * How far a measured span may stray before it is pulled back.
 *
 * Wide on purpose: this catches a measurement that cannot describe glasses at
 * all, not one that is merely off. Detection reporting a span of 0.9 or 0.15
 * — one "lens" that is really the gap beside a temple, or two fragments of the
 * same lens — would otherwise render the frame at several times or a third of
 * its size, since the on-screen width is the lens span divided by this. A
 * moderately wrong span is left alone: it is indistinguishable from an
 * unusually shaped frame, and the admin size slider exists for that.
 */
const SPAN_TOLERANCE_LOW = 0.72;
const SPAN_TOLERANCE_HIGH = 1.31;
/** How far the lens midpoint may sit from the image centre. */
const MAX_MID_OFFSET = 0.18;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Pulls an overlay geometry back to something a real pair of glasses could
 * have.
 *
 * The rendered width is the lens span *divided* by this fraction, so a
 * misread span does not degrade the fit gracefully — it multiplies. A photo
 * whose temple arms survived cropping measures a span around 0.31 while the
 * stored geometry claims 0.5, and the frame renders at ~60% of the size it
 * should, floating small and high on the face. Automatic lens detection gets
 * this wrong often enough (etched logos, angled shots, glare on one lens) that
 * the value is worth sanity-checking on every frame rather than trusting.
 */
export function sanitizeOverlayGeometry(geom: OverlayGeometry): OverlayGeometry | null {
  const { aspect } = geom;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;

  const span = geom.lensRightX - geom.lensLeftX;
  if (!Number.isFinite(span) || span <= 0) return null;

  const expected = FRONT_SPAN_X_ASPECT / aspect;
  const safeSpan = clamp(span, expected * SPAN_TOLERANCE_LOW, expected * SPAN_TOLERANCE_HIGH);
  const mid = clamp(
    (geom.lensLeftX + geom.lensRightX) / 2,
    0.5 - MAX_MID_OFFSET,
    0.5 + MAX_MID_OFFSET
  );

  return {
    aspect,
    lensLeftX: mid - safeSpan / 2,
    lensRightX: mid + safeSpan / 2,
    lensY: clamp(geom.lensY, 0.15, 0.85),
  };
}

export interface CoverTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** object-fit: cover scale + crop offset for fitting a source into a display box. */
export function computeCoverTransform(
  source: { videoWidth: number; videoHeight: number },
  display: { width: number; height: number }
): CoverTransform {
  const { videoWidth, videoHeight } = source;
  const { width: cw, height: ch } = display;
  const scale = Math.max(cw / videoWidth, ch / videoHeight);
  const offsetX = (videoWidth * scale - cw) / 2;
  const offsetY = (videoHeight * scale - ch) / 2;
  return { scale, offsetX, offsetY };
}

/**
 * Maps a face pose measured in native video-pixel coordinates onto the
 * displayed (object-fit: cover, so cropped/scaled) video element, and applies
 * the product's fine-tuning offsets.
 */
export function computeOverlayPlacement(
  pose: FacePose,
  tryOn: TryOnConfig,
  video: { videoWidth: number; videoHeight: number },
  display: { width: number; height: number }
): OverlayPlacement | null {
  const { width: cw, height: ch } = display;
  if (!video.videoWidth || !video.videoHeight || !cw || !ch) return null;

  const { scale, offsetX, offsetY } = computeCoverTransform(video, display);
  const geom = sanitizeOverlayGeometry(tryOn.overlayGeometry ?? DEFAULT_OVERLAY_GEOMETRY);
  if (!geom) return null;

  // `pose.width` is sized for the default framing; convert it to the physical
  // lens-centre distance, then back out the width this image needs so its own
  // lens centres land on the eyes — whatever its crop.
  const lensSpanFrac = geom.lensRightX - geom.lensLeftX;
  if (!(lensSpanFrac > 0)) return null;

  const lensSpanPx =
    pose.width * scale * tryOn.scale * (DEFAULT_OVERLAY_GEOMETRY.lensRightX - DEFAULT_OVERLAY_GEOMETRY.lensLeftX);
  const widthPx = lensSpanPx / lensSpanFrac;
  const heightPx = widthPx / geom.aspect;
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0) return null;

  // Product offsets are expressed along the face's own axes so they stay
  // correct when the head is tilted.
  const rollRad = (pose.roll * Math.PI) / 180;
  const ux = Math.cos(rollRad);
  const uy = Math.sin(rollRad);

  const alongFace = tryOn.offsetX * widthPx;
  const downFace = tryOn.offsetY * heightPx;

  const centerXPx =
    pose.anchorX * scale - offsetX + alongFace * ux - downFace * uy;
  const centerYPx =
    pose.anchorY * scale - offsetY + alongFace * uy + downFace * ux;

  if (!Number.isFinite(centerXPx) || !Number.isFinite(centerYPx)) return null;

  // Align the image's own lens-centre midpoint to the face anchor, rather than
  // assuming that point is the image's centre.
  const lensMidXFrac = (geom.lensLeftX + geom.lensRightX) / 2;
  const anchorOffsetX = (lensMidXFrac - 0.5) * widthPx;
  const anchorOffsetY = (geom.lensY - 0.5) * heightPx;

  return {
    leftPx: centerXPx - widthPx / 2 - anchorOffsetX * ux + anchorOffsetY * uy,
    topPx: centerYPx - heightPx / 2 - anchorOffsetX * uy - anchorOffsetY * ux,
    widthPx,
    heightPx,
    rollDeg: pose.roll + tryOn.rotationOffset,
    yawDeg: pose.yaw,
    pitchDeg: pose.pitch,
  };
}

/**
 * CSS transform for the overlay. Order matters: roll is in-plane, so it is
 * applied last (outermost) and yaw/pitch tilt the frame in depth beneath it.
 */
export function overlayTransform(placement: OverlayPlacement, opts?: { flattenDepth?: boolean }): string {
  const { rollDeg, yawDeg, pitchDeg } = placement;
  if (opts?.flattenDepth) return `rotate(${rollDeg}deg)`;
  return [
    "perspective(900px)",
    `rotateZ(${rollDeg}deg)`,
    `rotateY(${yawDeg}deg)`,
    `rotateX(${pitchDeg}deg)`,
  ].join(" ");
}

/**
 * Placement for a side-profile overlay (temple arm visible), anchored on a
 * single point instead of a lens pair — a side photo shows one visible
 * lens/hinge, not two.
 *
 * Sized against the SAME per-product physical-width reference
 * `computeOverlayPlacement` uses for the front image — this product's own
 * (sanitized) lens span, not the generic default span — so the frame
 * doesn't visibly resize when cross-fading between the front and side
 * images. A product whose front geometry has a narrower-than-default span
 * (which `sanitizeOverlayGeometry` may itself widen towards plausibility)
 * needs its side image widened by that same factor, or the side overlay
 * renders at the bare default size — a fixed, product-independent size that
 * has no reason to match this specific frame's real proportions, which is
 * exactly what made it look "shrunk" relative to the front image it's
 * supposed to continue.
 */
export function computeSideOverlayPlacement(
  pose: FacePose,
  tryOn: TryOnConfig,
  geometry: SideOverlayGeometry,
  video: { videoWidth: number; videoHeight: number },
  display: { width: number; height: number }
): OverlayPlacement | null {
  const { width: cw, height: ch } = display;
  if (!video.videoWidth || !video.videoHeight || !cw || !ch) return null;
  if (!(geometry.aspect > 0)) return null;

  const { scale, offsetX, offsetY } = computeCoverTransform(video, display);

  const frontGeom = sanitizeOverlayGeometry(tryOn.overlayGeometry ?? DEFAULT_OVERLAY_GEOMETRY);
  const lensSpanFrac = frontGeom ? frontGeom.lensRightX - frontGeom.lensLeftX : NaN;
  const referenceSpanFrac =
    lensSpanFrac > 0 ? lensSpanFrac : DEFAULT_OVERLAY_GEOMETRY.lensRightX - DEFAULT_OVERLAY_GEOMETRY.lensLeftX;

  const lensSpanPx =
    pose.width * scale * tryOn.scale * (DEFAULT_OVERLAY_GEOMETRY.lensRightX - DEFAULT_OVERLAY_GEOMETRY.lensLeftX);
  const widthPx = lensSpanPx / referenceSpanFrac;
  const heightPx = widthPx / geometry.aspect;
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0) return null;

  const rollRad = (pose.roll * Math.PI) / 180;
  const ux = Math.cos(rollRad);
  const uy = Math.sin(rollRad);

  const alongFace = tryOn.offsetX * widthPx;
  const downFace = tryOn.offsetY * heightPx;

  const centerXPx = pose.anchorX * scale - offsetX + alongFace * ux - downFace * uy;
  const centerYPx = pose.anchorY * scale - offsetY + alongFace * uy + downFace * ux;
  if (!Number.isFinite(centerXPx) || !Number.isFinite(centerYPx)) return null;

  const anchorOffsetX = (geometry.anchorX - 0.5) * widthPx;
  const anchorOffsetY = (geometry.anchorY - 0.5) * heightPx;

  return {
    leftPx: centerXPx - widthPx / 2 - anchorOffsetX * ux + anchorOffsetY * uy,
    topPx: centerYPx - heightPx / 2 - anchorOffsetX * uy - anchorOffsetY * ux,
    widthPx,
    heightPx,
    rollDeg: pose.roll + tryOn.rotationOffset,
    yawDeg: pose.yaw,
    pitchDeg: pose.pitch,
  };
}

export interface SideOverlaySelection {
  src: string;
  placement: OverlayPlacement;
}

/**
 * Picks the side-profile image relevant to the current yaw, if the product
 * has one for that direction, and computes its placement. Returns null when
 * there's nothing to show — the caller should keep rendering the front-only
 * overlay in that case (this is what keeps every existing product, with no
 * side images at all, rendering exactly as before this feature existed).
 *
 * Yaw sign convention: positive yaw is the frame's right side rotating away
 * from the camera (see faceGeometry.ts's note on `rotateY`), which is when
 * the right-side image should start coming into view. Flip this if testing
 * on a real camera shows it backwards for this app's mirrored video.
 */
export function selectSideOverlay(
  pose: FacePose,
  tryOn: TryOnConfig,
  video: { videoWidth: number; videoHeight: number },
  display: { width: number; height: number }
): SideOverlaySelection | null {
  const useRight = pose.yaw > 0;
  const src = useRight ? tryOn.rightImage : tryOn.leftImage;
  const geometry = useRight ? tryOn.rightImageGeometry : tryOn.leftImageGeometry;
  if (!src || !geometry) return null;

  const placement = computeSideOverlayPlacement(pose, tryOn, geometry, video, display);
  return placement ? { src, placement } : null;
}
