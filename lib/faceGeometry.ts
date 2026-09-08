import {
  FRAME_EYE_SPAN,
  FRAME_VIEWBOX_HEIGHT,
  FRAME_VIEWBOX_WIDTH,
} from "@/lib/frameShapes";
import { ChannelSmoother } from "@/lib/oneEuroFilter";

export interface NormalizedPoint {
  x: number;
  y: number;
  z?: number;
}

export interface FacePose {
  /** Where the lens-center line should sit, in video pixel coordinates. */
  anchorX: number;
  anchorY: number;
  /** Rendered overlay size in video pixel coordinates. */
  width: number;
  height: number;
  /** Head rotation in degrees. */
  roll: number;
  yaw: number;
  pitch: number;
}

// MediaPipe FaceLandmarker indices.
// Iris centers (468/473) exist only in the full 478-point output; the rest are
// in the base 468-point mesh and are always available.
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const LEFT_TEMPLE = 234;
const RIGHT_TEMPLE = 454;
const NOSE_BRIDGE = 168;
const FOREHEAD = 10;
const CHIN = 152;

// --- Tuning constants -------------------------------------------------------
/**
 * Lens-centre span relative to the outer eye-corner distance (33 to 263).
 * The outer canthi sit ~90mm apart and the pupils ~63mm, so the lens centres
 * land at roughly 0.70 of that span.
 */
const LENS_SPAN_TO_OUTER_EYE = 0.7;
/** Lens-center span implied by temple-to-temple width. */
const LENS_SPAN_TO_TEMPLE_WIDTH = 0.56;
/**
 * Temple width only stabilises the estimate when the eye corners get noisy —
 * the eye-corner distance is the primary signal.
 */
const TEMPLE_ESTIMATE_WEIGHT = 0.25;
/**
 * Anchor blend toward the nose bridge (landmark 168), separately per axis.
 * X blends a fair bit for centring and yaw stability. Y stays on the pupil
 * line — landmark 168 sits well above the pupils, so blending Y toward it
 * rides the frame up onto the eyebrows. Vertical fine-tuning is left to each
 * frame's `offsetY`.
 */
const BRIDGE_ANCHOR_BLEND_X = 0.4;
const BRIDGE_ANCHOR_BLEND_Y = 0.0;
/** Degrees of yaw at full left/right temple asymmetry. */
const YAW_GAIN = 78;
const MAX_YAW = 55;
const PITCH_GAIN = 120;
const MAX_PITCH = 32;
/** Yaw/roll below which a frame counts as "frontal" for pitch calibration. */
const CALIBRATION_YAW_LIMIT = 12;
const CALIBRATION_ROLL_LIMIT = 12;
/** Yaw foreshortening is compensated, but never divide by ~0. */
const MIN_YAW_COS = 0.45;

const VIEWBOX_WIDTH_TO_EYE_SPAN = FRAME_VIEWBOX_WIDTH / FRAME_EYE_SPAN;
const VIEWBOX_ASPECT = FRAME_VIEWBOX_HEIGHT / FRAME_VIEWBOX_WIDTH;

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

interface Vec2 {
  x: number;
  y: number;
}

function midpoint(a?: NormalizedPoint, b?: NormalizedPoint): Vec2 | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;

let warnedMissingIris = false;

/**
 * Learns the user's own neutral head pitch.
 *
 * Where the eye line falls between forehead and chin varies by face shape,
 * camera height and mesh version, so a hardcoded "level head" constant makes
 * every user permanently tilted. Instead the baseline is learned from frames
 * where the head is roughly frontal, and pitch is reported relative to it.
 */
export class PitchCalibrator {
  private baseline: number | null = null;

  reset() {
    this.baseline = null;
  }

  /** Returns pitch in degrees for the given eye-line ratio. */
  update(eyeLineRatio: number, yaw: number, roll: number): number {
    if (this.baseline === null) {
      this.baseline = eyeLineRatio;
      return 0;
    }
    const isFrontal =
      Math.abs(yaw) < CALIBRATION_YAW_LIMIT && Math.abs(roll) < CALIBRATION_ROLL_LIMIT;
    if (isFrontal) {
      // Drift slowly toward the current pose so the baseline tracks the
      // user's resting position without absorbing deliberate nods.
      this.baseline += (eyeLineRatio - this.baseline) * 0.002;
    }
    return clamp((eyeLineRatio - this.baseline) * PITCH_GAIN, -MAX_PITCH, MAX_PITCH);
  }
}

/**
 * Derives glasses placement and head pose from face landmarks.
 *
 * Everything is measured along the face's own axes (the eye line and its
 * perpendicular) rather than screen axes, so the results stay correct when
 * the head is tilted.
 */
export function computeFacePose(
  landmarks: NormalizedPoint[],
  videoWidth: number,
  videoHeight: number,
  pitchCalibrator?: PitchCalibrator
): FacePose | null {
  const px = (p?: NormalizedPoint): Vec2 | null =>
    p ? { x: p.x * videoWidth, y: p.y * videoHeight } : null;

  const irisL = landmarks[LEFT_IRIS_CENTER];
  const irisR = landmarks[RIGHT_IRIS_CENTER];
  if (!irisL && !warnedMissingIris) {
    warnedMissingIris = true;
    console.warn("[try-on] Iris landmarks unavailable, using eye-corner landmarks.");
  }

  // Outer eye corners drive both scale and rotation: they are stable, always
  // present in the base mesh, and span the full eye line.
  const outerL = px(landmarks[LEFT_EYE_OUTER]);
  const outerR = px(landmarks[RIGHT_EYE_OUTER]);
  const bridge = px(landmarks[NOSE_BRIDGE]);
  const templeL = px(landmarks[LEFT_TEMPLE]);
  const templeR = px(landmarks[RIGHT_TEMPLE]);
  const forehead = px(landmarks[FOREHEAD]);
  const chin = px(landmarks[CHIN]);

  if (!outerL || !outerR || !bridge || !templeL || !templeR) return null;

  // Pupils (iris when available) only refine where the lens line sits.
  const pupilL =
    px(irisL) ?? scalePoint(midpoint(landmarks[LEFT_EYE_OUTER], landmarks[LEFT_EYE_INNER]), videoWidth, videoHeight);
  const pupilR =
    px(irisR) ?? scalePoint(midpoint(landmarks[RIGHT_EYE_INNER], landmarks[RIGHT_EYE_OUTER]), videoWidth, videoHeight);
  if (!pupilL || !pupilR) return null;

  // Face axes: u runs left eye -> right eye, v is "down the face".
  const eyeVec = sub(outerR, outerL);
  const outerEyeDist = Math.hypot(eyeVec.x, eyeVec.y);
  if (!Number.isFinite(outerEyeDist) || outerEyeDist <= 1) return null;

  const u: Vec2 = { x: eyeVec.x / outerEyeDist, y: eyeVec.y / outerEyeDist };
  const v: Vec2 = { x: -u.y, y: u.x };

  const roll = toDeg(Math.atan2(eyeVec.y, eyeVec.x));

  // --- Yaw: how far the nose bridge sits off-centre between the temples ---
  // The side with the smaller nose-to-temple distance is the one rotating
  // away from the camera. CSS rotateY(+) pushes the element's right side
  // away, so a compressed right side must produce a positive yaw — hence the
  // leading minus.
  const distToLeftTemple = dot(sub(bridge, templeL), u);
  const distToRightTemple = dot(sub(templeR, bridge), u);
  const halfSpanSum = distToLeftTemple + distToRightTemple;
  const yawRatio = halfSpanSum > 1 ? (distToRightTemple - distToLeftTemple) / halfSpanSum : 0;
  const yaw = clamp(-yawRatio * YAW_GAIN, -MAX_YAW, MAX_YAW);

  // --- Pitch: where the eye line falls between forehead and chin, measured
  // relative to this user's learned neutral pose ---
  let pitch = 0;
  if (forehead && chin && pitchCalibrator) {
    const faceHeight = dot(sub(chin, forehead), v);
    if (faceHeight > 1) {
      const eyeMid: Vec2 = { x: (pupilL.x + pupilR.x) / 2, y: (pupilL.y + pupilR.y) / 2 };
      const eyeLineRatio = dot(sub(eyeMid, forehead), v) / faceHeight;
      pitch = pitchCalibrator.update(eyeLineRatio, yaw, roll);
    }
  }

  // --- Scale: combine eye span and temple width, both yaw-compensated ---
  // Turning the head foreshortens horizontal distances; without this the
  // glasses would visibly shrink as the user looks left or right.
  const yawCos = Math.max(Math.cos((yaw * Math.PI) / 180), MIN_YAW_COS);
  const templeWidth = Math.abs(dot(sub(templeR, templeL), u));

  const spanFromEyes = (outerEyeDist / yawCos) * LENS_SPAN_TO_OUTER_EYE;
  const spanFromTemples = (templeWidth / yawCos) * LENS_SPAN_TO_TEMPLE_WIDTH;
  const lensSpan =
    spanFromEyes * (1 - TEMPLE_ESTIMATE_WEIGHT) + spanFromTemples * TEMPLE_ESTIMATE_WEIGHT;

  const width = lensSpan * VIEWBOX_WIDTH_TO_EYE_SPAN;
  const height = width * VIEWBOX_ASPECT;

  // --- Anchor: pupil line pulled up toward the top of the nose bridge, so the
  // frame rests on the bridge instead of sagging toward the nostrils ---
  const pupilMidX = (pupilL.x + pupilR.x) / 2;
  const pupilMidY = (pupilL.y + pupilR.y) / 2;
  const anchorX = pupilMidX * (1 - BRIDGE_ANCHOR_BLEND_X) + bridge.x * BRIDGE_ANCHOR_BLEND_X;
  const anchorY = pupilMidY * (1 - BRIDGE_ANCHOR_BLEND_Y) + bridge.y * BRIDGE_ANCHOR_BLEND_Y;

  return { anchorX, anchorY, width, height, roll, yaw, pitch };
}

function scalePoint(p: Vec2 | null, videoWidth: number, videoHeight: number): Vec2 | null {
  return p ? { x: p.x * videoWidth, y: p.y * videoHeight } : null;
}

type PoseChannel = "anchorX" | "anchorY" | "width" | "roll" | "yaw" | "pitch";

/**
 * Smooths pose across frames. Position and size get tighter smoothing than
 * rotation, which is noisier and matters less at small magnitudes.
 */
export class FacePoseSmoother {
  private smoother = new ChannelSmoother<PoseChannel>(
    {
      anchorX: { minCutoff: 1.4, beta: 0.06 },
      anchorY: { minCutoff: 1.4, beta: 0.06 },
      width: { minCutoff: 0.7, beta: 0.02 },
      roll: { minCutoff: 1.0, beta: 0.04 },
      yaw: { minCutoff: 0.8, beta: 0.03 },
      pitch: { minCutoff: 0.8, beta: 0.03 },
    },
    { minCutoff: 1.2, beta: 0.05 }
  );

  reset() {
    this.smoother.reset();
  }

  next(pose: FacePose | null, timestampMs: number): FacePose | null {
    if (!pose) {
      this.smoother.reset();
      return null;
    }
    const width = this.smoother.smooth("width", pose.width, timestampMs);
    return {
      anchorX: this.smoother.smooth("anchorX", pose.anchorX, timestampMs),
      anchorY: this.smoother.smooth("anchorY", pose.anchorY, timestampMs),
      width,
      height: width * VIEWBOX_ASPECT,
      roll: this.smoother.smooth("roll", pose.roll, timestampMs),
      yaw: this.smoother.smooth("yaw", pose.yaw, timestampMs),
      pitch: this.smoother.smooth("pitch", pose.pitch, timestampMs),
    };
  }
}
