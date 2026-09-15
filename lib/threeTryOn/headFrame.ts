import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { NormalizedPoint } from "@/lib/faceGeometry";

/**
 * The rigid head frame the glasses are attached to, and the per-person
 * constants that attachment needs.
 *
 * Coordinate conventions
 * ----------------------
 * - **Camera space** (Three.js, centimetres): the camera at the origin looking
 *   down -Z, +X right, +Y up. MediaPipe's head-pose matrix is expressed here:
 *   its translation T is the canonical head's origin (roughly the centre of
 *   the skull, on the ear line), its rotation R the head's orientation.
 * - **Head space**: the canonical face's own axes — +X toward the head's
 *   right (the wearer's left as seen on screen, before mirroring), +Y up,
 *   +Z forward out of the face. That is also the GLB convention (frame
 *   facing +Z, arms running back along -Z), so a model needs no rotation to
 *   sit in head space.
 * - **Landmarks**: MediaPipe's normalised image coordinates, x/y in 0..1 with
 *   y down, z in the same scale as x with 0 at the head's centre and negative
 *   toward the camera.
 *
 * What is constant and what is not
 * --------------------------------
 * Where a pair of glasses rests on a head — a few centimetres in front of
 * the skull's centre, at the nose bridge — does not change when the head
 * turns, and neither does the width of the frame. Both were previously
 * re-derived from 2D pixel measurements every frame, so they wobbled with
 * every foreshortening error. Here they are *calibrated*: measured on frames
 * where the head is close to frontal (where the 2D measurements are honest),
 * averaged, then held. Every frame after that is a pure rigid transform,
 * `anchor = T + R · N`, and the perspective camera does the rest.
 */

/** MediaPipe FaceLandmarker indices used here. */
export const LM = {
  noseBridge: 168,
  noseTop: 6,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  leftTemple: 234,
  rightTemple: 454,
  leftIris: 468,
  rightIris: 473,
  forehead: 10,
  chin: 152,
} as const;

/**
 * Smoothing, in one place.
 *
 * The One Euro filters on the pose matrix live in `FaceMatrixSmoother`
 * (position and rotation channels). The values below govern the calibrated
 * constants, which are not tracked but *learned*: quickly at first, then
 * only nudged, so that a turned head can never pull them away from what was
 * measured when the head was frontal.
 */
export const HEAD_CALIBRATION = {
  /** Frames averaged plainly before switching to the slow follow rate. */
  warmUpFrames: 12,
  /** Per-frame blend toward a new frontal measurement once warmed up. */
  followRate: 0.015,
  /** A frame counts as frontal — safe to calibrate from — within these. */
  maxYawDeg: 22,
  maxPitchDeg: 18,
} as const;

/**
 * The invisible head, as an ellipsoid in head space, placed relative to the
 * nose bridge and sized in multiples of the measured temple-to-temple width.
 * It writes depth only: temple arms behind it vanish, exactly where a real
 * head would hide them.
 *
 * Proportions of a real skull: the temples are ~13.5 cm apart, the widest
 * point (above the ears) ~15 cm, the skull's centre ~9 cm behind the nasion
 * and about as deep again behind that. An ellipsoid with these ratios sits
 * just *inside* the line the arms run along, which is the whole trick: the
 * near arm lies outside it and stays visible, the far arm passes behind it
 * and disappears, and head-on both show as the thin lines they really are.
 * It is also *clipped* at a plane just behind the lenses, so reaching all
 * the way forward to the face can never hide the rims, bridge or nose pads.
 */
export const HEAD_MASK = {
  halfWidth: 0.5,
  halfHeight: 0.78,
  halfDepth: 0.67,
  /** Centre offset below the eye line — a head's middle sits below the eyes. */
  centreY: -0.1,
  /** How far behind the nose bridge the ellipsoid is centred. */
  centreBack: 0.67,
  /** Distance behind the lens plane at which the mask is cut off. */
  frontClearance: 0.1,
} as const;

export interface HeadFrameInput {
  /** Smoothed head-pose matrix, camera space. */
  matrix: Matrix4;
  landmarks: ReadonlyArray<NormalizedPoint>;
  /** Where the lens-centre line sits, normalised video coordinates (y down). */
  anchorU: number;
  anchorV: number;
  /** Lens-centre span as it appears on screen, as a fraction of the video's width. */
  projectedLensSpanFrac: number;
  /** Temple-to-temple width, yaw-compensated, as a fraction of the video's width. */
  faceWidthFrac: number;
  /** Vertical field of view of the camera the matrix was solved against. */
  verticalFovDeg: number;
  aspect: number;
}

/** Everything the scene needs to place the frame, plus what the debug overlay shows. */
export interface HeadFrame {
  /** Lens-centre line in camera space — where the frame's origin goes. */
  anchor: Vector3;
  quaternion: Quaternion;
  /** Distance between the lens centres, in centimetres. */
  lensSpanCm: number;
  /** Temple-to-temple width, in centimetres. */
  faceWidthCm: number;
  /** The anchor's offset from the head's origin, in head space (cm). */
  anchorOffset: Vector3;
  /** Whether the constants come from calibration rather than this one frame. */
  calibrated: boolean;
  /** Head rotation, degrees, for display. */
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Head origin, camera space. */
  origin: Vector3;
}

const FRONTAL_FORESHORTEN = Math.cos(MathUtils.DEG2RAD * HEAD_CALIBRATION.maxYawDeg);

/** Running estimate of a constant: a plain mean while warming up, a slow EMA after. */
class Constant {
  private samples = 0;
  value = 0;
  get ready() {
    return this.samples > 0;
  }
  get settled() {
    return this.samples >= HEAD_CALIBRATION.warmUpFrames;
  }
  reset() {
    this.samples = 0;
    this.value = 0;
  }
  observe(x: number) {
    this.samples++;
    const rate = this.samples <= HEAD_CALIBRATION.warmUpFrames ? 1 / this.samples : HEAD_CALIBRATION.followRate;
    this.value += (x - this.value) * rate;
  }
}

export class HeadFrameTracker {
  readonly frame: HeadFrame = {
    anchor: new Vector3(),
    quaternion: new Quaternion(),
    lensSpanCm: 0,
    faceWidthCm: 0,
    anchorOffset: new Vector3(),
    calibrated: false,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    origin: new Vector3(),
  };

  private offsetX = new Constant();
  private offsetY = new Constant();
  private offsetZ = new Constant();
  private lensSpan = new Constant();
  private faceWidth = new Constant();

  private scratchScale = new Vector3();
  private inverseRotation = new Quaternion();
  private point = new Vector3();
  private euler = new Euler();

  reset() {
    this.offsetX.reset();
    this.offsetY.reset();
    this.offsetZ.reset();
    this.lensSpan.reset();
    this.faceWidth.reset();
    this.frame.calibrated = false;
  }

  /** Returns false when the frame can't be placed from this input. */
  update(input: HeadFrameInput): boolean {
    const f = this.frame;
    input.matrix.decompose(f.origin, f.quaternion, this.scratchScale);
    const distance = -f.origin.z;
    if (!(distance > 0) || !Number.isFinite(distance)) return false;

    // World extent of the video frame at the head's depth: everything measured
    // as a fraction of the video converts through this.
    const halfHeightWorld = distance * Math.tan(MathUtils.DEG2RAD * input.verticalFovDeg * 0.5);
    const halfWidthWorld = halfHeightWorld * input.aspect;
    const viewportWidthWorld = halfWidthWorld * 2;

    // Head rotation as the user would describe it. YXZ so yaw is read first,
    // about the vertical, and the others stay meaningful at large yaw.
    this.euler.setFromQuaternion(f.quaternion, "YXZ");
    f.yawDeg = MathUtils.RAD2DEG * this.euler.y;
    f.pitchDeg = MathUtils.RAD2DEG * this.euler.x;
    f.rollDeg = MathUtils.RAD2DEG * this.euler.z;

    // The anchor this frame, in camera space: through the 2D anchor, at the
    // depth of the nose bridge — the landmark's own z says how far in front
    // of the head's centre the bridge sits, which is the part the old maths
    // ignored (it put the frame at the skull's centre).
    const bridge = input.landmarks[LM.noseBridge];
    const bridgeZ = bridge?.z ?? 0;
    const bridgeDepth = distance + bridgeZ * viewportWidthWorld;
    const bridgeHalfWidth = halfWidthWorld * (bridgeDepth / distance);
    const bridgeHalfHeight = halfHeightWorld * (bridgeDepth / distance);
    this.point.set(
      (input.anchorU * 2 - 1) * bridgeHalfWidth,
      -(input.anchorV * 2 - 1) * bridgeHalfHeight,
      -bridgeDepth
    );
    // …and expressed in head space, where it is a constant of the person.
    this.inverseRotation.copy(f.quaternion).invert();
    this.point.sub(f.origin).applyQuaternion(this.inverseRotation);

    // How much this rotation shortens the lens line on screen — the part of
    // the head's X axis that survives into the screen plane.
    const e = input.matrix.elements;
    const axisLength = Math.hypot(e[0], e[1], e[2]);
    const foreshorten = axisLength > 0 ? Math.hypot(e[0], e[1]) / axisLength : 1;

    const spanCm = (input.projectedLensSpanFrac * viewportWidthWorld * (bridgeDepth / distance)) / Math.max(foreshorten, 0.5);
    const widthCm = input.faceWidthFrac * viewportWidthWorld;

    const frontal =
      Math.abs(f.yawDeg) <= HEAD_CALIBRATION.maxYawDeg &&
      Math.abs(f.pitchDeg) <= HEAD_CALIBRATION.maxPitchDeg &&
      foreshorten >= FRONTAL_FORESHORTEN;
    if (frontal || !this.offsetX.ready) {
      this.offsetX.observe(this.point.x);
      this.offsetY.observe(this.point.y);
      this.offsetZ.observe(this.point.z);
      this.lensSpan.observe(spanCm);
      this.faceWidth.observe(widthCm);
    }
    f.calibrated = this.offsetX.settled;

    f.anchorOffset.set(this.offsetX.value, this.offsetY.value, this.offsetZ.value);
    f.lensSpanCm = this.lensSpan.value;
    f.faceWidthCm = this.faceWidth.value;

    // The rigid attachment: the head's origin, plus the calibrated offset
    // carried by the head's own rotation.
    f.anchor.copy(f.anchorOffset).applyQuaternion(f.quaternion).add(f.origin);
    return f.lensSpanCm > 0 && f.faceWidthCm > 0;
  }
}
