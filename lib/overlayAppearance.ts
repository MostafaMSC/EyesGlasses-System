/**
 * How the frame is painted onto the face — edge fading and contact shadow.
 *
 * Shared by the live preview and the captured photo so the saved image matches
 * what the user framed; they used to diverge, and the capture came out with
 * hard-cut temple arms and no shadow.
 */

/** Fractions of the overlay width faded out at each side. */
export interface EdgeFade {
  left: number;
  right: number;
}

const DEFAULT_EDGE_FADE = 0.12;
/** Yaw at which the fade bias is fully applied. */
const YAW_FULL = 40;
/** Extra fade on the side rotating away from the camera. */
const YAW_FADE_GAIN = 1.5;
/** Fade removed from the side swinging toward it. */
const YAW_FADE_RELIEF = 0.55;
const MAX_FADE = 0.4;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * A flat front-on image can't wrap its temple arms behind the ears, so without
 * fading they hang in mid-air beside the head.
 *
 * The fade is biased by head yaw rather than kept symmetric: `rotateY(+)`
 * pushes the frame's right side away from the camera, and that arm is heading
 * behind the head, so it should disappear sooner — while the near arm swings
 * into full view and needs less hiding. A symmetric fade makes a turned head
 * look like the far arm is still floating out over the cheek.
 */
export function edgeFade(fade: number | undefined, yawDeg: number): EdgeFade | null {
  const base = fade ?? DEFAULT_EDGE_FADE;
  if (!(base > 0)) return null;

  const bias = clamp(yawDeg / YAW_FULL, -1, 1);
  const away = Math.min(base * (1 + Math.abs(bias) * YAW_FADE_GAIN), MAX_FADE);
  const near = base * (1 - Math.abs(bias) * YAW_FADE_RELIEF);

  return bias >= 0 ? { left: near, right: away } : { left: away, right: near };
}

/** CSS `mask-image` for the fade, or undefined when there is nothing to fade. */
export function edgeFadeMask(fade: EdgeFade | null): string | undefined {
  if (!fade) return undefined;
  const left = (fade.left * 100).toFixed(1);
  const right = (100 - fade.right * 100).toFixed(1);
  return `linear-gradient(to right, transparent 0%, #000 ${left}%, #000 ${right}%, transparent 100%)`;
}

/**
 * Grounds the frame against the face instead of looking like a sticker
 * floating above it.
 */
export const CONTACT_SHADOW = {
  css: "drop-shadow(0 3px 4px rgba(0,0,0,0.42)) drop-shadow(0 1px 1px rgba(0,0,0,0.28))",
  canvas: { color: "rgba(0,0,0,0.42)", blur: 4, offsetY: 3 },
};

/**
 * Copies the overlay into its own canvas with the edge fade baked into the
 * alpha channel. Canvas 2D has no `mask-image`, so the fade has to be composited
 * before the frame is drawn over the photo.
 */
export function maskedOverlayCanvas(
  image: CanvasImageSource,
  widthPx: number,
  heightPx: number,
  fade: EdgeFade | null
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(widthPx));
  canvas.height = Math.max(1, Math.round(heightPx));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (fade) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(Math.min(fade.left, 0.49), "rgba(0,0,0,1)");
    gradient.addColorStop(Math.max(1 - fade.right, 0.51), "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}
