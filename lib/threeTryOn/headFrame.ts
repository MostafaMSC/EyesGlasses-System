import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { NormalizedPoint } from "@/lib/faceGeometry";

/**
 * Where the glasses sit on the head, how big they are, and how far that can
 * be trusted — all measured in **head space**, never in screen pixels.
 *
 * Coordinate conventions
 * ----------------------
 * - **Camera space** (Three.js, centimetres): camera at the origin looking
 *   down -Z, +X right, +Y up. MediaPipe's head-pose matrix lives here: its
 *   translation T is the canonical head's origin, its rotation R the head's
 *   orientation.
 * - **Head space**: the canonical face's own axes — +X toward the head's
 *   right, +Y up, +Z forward out of the face. Also the GLB convention (frame
 *   facing +Z, arms back along -Z), so a model needs no rotation.
 * - **Landmarks**: MediaPipe's normalised image coordinates, x/y in 0..1 with
 *   y down, z on the same scale as x with 0 at the head's centre and negative
 *   toward the camera.
 *
 * Why head space
 * --------------
 * The previous version measured the face on screen — pixel distances divided
 * by the cosine of a yaw guessed from nose position. A turned head does not
 * shrink by cos(yaw) (landmarks sit at different depths, and the guess was
 * itself wrong), so the "constant" face width came out anywhere from 16 to
 * 23 cm for the same person depending on pose, and a head that began turned
 * never calibrated at all. Here every landmark is lifted into 3D with its
 * own depth and carried into head space with the inverse of the head pose:
 * there, a person's pupils, temples and nose bridge are *constants of the
 * face*, independent of where the head is or which way it points, and no
 * foreshortening has to be undone.
 *
 * Calibration is progressive and confidence-weighted: every frame
 * contributes in proportion to how reliable it is (face fully in view,
 * plausible geometry, how frontal), so a head that starts turned still gives
 * a usable estimate immediately, and the estimate sharpens — without the
 * glasses jumping — as better frames arrive.
 */

/** MediaPipe FaceLandmarker indices used here. */
export const LM = {
  noseBridge: 168,
  noseTop: 6,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  leftTemple: 234,
  rightTemple: 454,
  leftIris: 468,
  rightIris: 473,
  forehead: 10,
  chin: 152,
} as const;

export const HEAD_CALIBRATION = {
  /**
   * Accumulated weight (in fully frontal frames) at which the estimate counts
   * as settled. Only *reliable* frames count towards it — see `reliableYawDeg`.
   */
  settledWeight: 6,
  /**
   * A frame is a reliable observation only when the head is within this much
   * of facing the camera. Measured on a real webcam, a head turned past ~25°
   * reads the pupil span ~12% low (and ~20% low past 35°), so such frames
   * are never allowed to make the result "calibrated" — and once there is
   * reliable evidence they are not allowed to move the result at all.
   */
  reliableYawDeg: 25,
  reliablePitchDeg: 25,
  /**
   * Reliable weight at which the reference (frontal-only) estimate replaces
   * the provisional one built from whatever was visible.
   */
  referenceWeight: 1,
  /**
   * Cap on accumulated weight. Past it, new frames nudge the estimate rather
   * than averaging with an ever-longer history, so it can still adapt — slowly.
   */
  weightCap: 40,
  /**
   * A frame's weight falls with (cos yaw · cos pitch) to this power. Depth
   * from a turned head is the weakest landmark signal: measured on a real
   * webcam, the pupil span reads ~12% low at 25–35° of yaw and ~20% low past
   * that. A turned head still calibrates (nothing is thrown away), it just
   * counts for much less than a frontal one.
   */
  frontalExponent: 6,
  /**
   * Angular speed (rad/s) at which a frame's weight halves, 1 / (1 + (ω/ω0)⁴).
   * The pose matrix is smoothed, so while the head is moving it lags the live
   * landmarks and the head-space lift is skewed (real webcam: span error 26%
   * on frames with >12° of motion between detections vs 2–5% otherwise).
   * The fourth power makes it close to a gate: a still head counts fully, a
   * head turning at twice ω0 almost not at all.
   */
  motionRadPerSecond: 0.6,
  /**
   * The very first frame has no previous pose to measure motion against, and
   * frames right after a face is (re)acquired are often mid-movement. Its
   * weight is scaled by this until motion is known.
   */
  unknownMotionWeight: 0.25,
  /**
   * Early on the estimate is a weighted median of the first samples (up to
   * `warmupSamples`), so one or two bad opening frames cannot set the size;
   * after that it is a running mean. The glasses are not placed until this
   * many usable, *distinct* observations exist (a phone camera in dim light
   * delivers ~11 fps while the loop runs faster, so the same camera frame
   * arrives several times — see `isRepeatOfLastFrame`).
   */
  warmupSamples: 9,
  /** A frame must carry at least this weight to count as reference (facing-camera) evidence. */
  minimumReferenceFrameWeight: 0.1,
  minimumObservations: 5,
  /**
   * Accumulated weight needed before the glasses are placed at all, so the
   * very first frame (often partly in view or mid-turn) never sets a visible
   * wrong size.
   */
  minimumWeight: 0.6,
  /** Applied values approach their target with this time constant. */
  applyTauSeconds: 0.45,
  /** A value may not change by more than this fraction of the lens span per second. */
  maxRelativeRatePerSecond: 0.5,
  /** A key landmark closer than this to the image edge means the face is cut off. */
  edgeMargin: 0.012,
  /** A frame disagreeing with the settled estimate by more than this is an outlier. */
  outlierRelative: 0.3,
  /** This many consecutive outliers mean a different face, and recalibrate. */
  newFaceFrames: 20,
  /** Plausibility: pupils' height / depth difference allowed, as a fraction of their span. */
  pupilTiltMax: 0.4,
  pupilDepthMax: 0.6,
  /**
   * How far in front of the nasal-bridge landmark the frame's front plane
   * stands, as a fraction of the lens span. Real frames rest on the nose pads
   * with the front a centimetre or so forward of the bridge.
   */
  standoffRatio: 0.12,
} as const;

export type CalibrationState = "searching" | "provisional" | "calibrated";

export interface HeadFrameInput {
  /** Smoothed head-pose matrix, camera space. */
  matrix: Matrix4;
  landmarks: ReadonlyArray<NormalizedPoint>;
  /** Vertical field of view of the camera the matrix was solved against. */
  verticalFovDeg: number;
  aspect: number;
  timestampMs: number;
}

/** What one frame measured, before any smoothing — kept for the debug view. */
export interface HeadMeasurement {
  lensSpanCm: number;
  faceWidthCm: number;
  outerEyeCm: number;
  /** 0..1: how much this frame was allowed to contribute. */
  quality: number;
  /** Quality ignoring head pose: face in view, geometry plausible. */
  landmarkQuality: number;
  visibilityMin: number;
  outlierRun: number;
}

/** Everything the scene needs to place the frame and the occluders. */
export interface HeadFrame {
  /** Head origin in camera space, and head orientation. */
  origin: Vector3;
  quaternion: Quaternion;
  /** Lens-centre line, in camera space — where the frame's origin goes. */
  anchor: Vector3;
  /** The same, as an offset from the head origin in head space. */
  anchorOffset: Vector3;
  /** Distance between the lens centres, in centimetres. */
  lensSpanCm: number;
  /** Temple-to-temple width (landmarks 234↔454), centimetres. */
  faceWidthCm: number;
  /** Head-space depth of the ear line (landmarks 234/454). */
  earZ: number;
  /** Head-space height of the pupil line. */
  pupilY: number;
  /** Head-space height of the forehead landmark (10), and forehead-to-chin (10↔152) distance. */
  foreheadY: number;
  faceHeightCm: number;
  state: CalibrationState;
  /** 0..1: how much reliable (facing-the-camera) evidence backs the calibration. */
  confidence: number;
  /**
   * What the applied values currently rest on: "frontal" (reliable frames only)
   * or "turned" (nothing but turned-head frames yet — read too small, so the
   * fit is only provisional).
   */
  basis: "frontal" | "turned";
  /** Whether this frame's pose counted as a reliable observation. */
  frameReliable: boolean;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Uniform scale carried by the pose matrix (should be ~1; reported for diagnosis). */
  matrixScale: number;
  /** Every landmark of this frame in head space, xyz triples; `landmarkCount` valid. */
  headLandmarks: Float32Array;
  landmarkCount: number;
  measurement: HeadMeasurement;
}

/**
 * Confidence-weighted estimate. For its first `warmupSamples` observations it
 * is the weighted median (robust to a bad opening frame or two); from then on
 * a weighted running mean that turns into a slow follower once warm.
 */
class Running {
  value = 0;
  weight = 0;
  count = 0;
  private warm: { x: number; w: number }[] = [];
  observe(x: number, w: number) {
    if (!(w > 0)) return;
    this.count++;
    if (this.warm.length < HEAD_CALIBRATION.warmupSamples) {
      this.warm.push({ x, w });
      this.weight = Math.min(this.weight + w, HEAD_CALIBRATION.weightCap);
      this.value = weightedMedian(this.warm);
      return;
    }
    const total = Math.min(this.weight, HEAD_CALIBRATION.weightCap) + w;
    this.value += (x - this.value) * (w / total);
    this.weight = Math.min(this.weight + w, HEAD_CALIBRATION.weightCap);
  }
  reset() {
    this.value = 0;
    this.weight = 0;
    this.count = 0;
    this.warm.length = 0;
  }
}

function weightedMedian(samples: { x: number; w: number }[]): number {
  const sorted = [...samples].sort((a, b) => a.x - b.x);
  let total = 0;
  for (const s of sorted) total += s.w;
  let acc = 0;
  for (const s of sorted) {
    acc += s.w;
    if (acc >= total / 2) return s.x;
  }
  return sorted[sorted.length - 1].x;
}

/**
 * One calibrated quantity, kept as two estimates:
 *  - `any`: every frame, weighted by pose — the fallback, so a person who
 *    starts (and stays) turned still gets *a* fit, labelled provisional;
 *  - `reference`: reliable (near-frontal, steady) frames only.
 * The reference replaces the fallback as soon as it has real evidence, and
 * from then on turned frames can no longer shift the result.
 */
class Estimate {
  private any = new Running();
  private reference = new Running();
  get value() {
    return this.reference.weight >= HEAD_CALIBRATION.referenceWeight ? this.reference.value : this.any.value;
  }
  /** Weight behind the fallback estimate (anything usable). */
  get weight() {
    return this.any.weight;
  }
  /** Number of usable observations behind the fallback estimate. */
  get count() {
    return this.any.count;
  }
  /** Weight of reliable evidence only. */
  get reliableWeight() {
    return this.reference.weight;
  }
  get usingReference() {
    return this.reference.weight >= HEAD_CALIBRATION.referenceWeight;
  }
  observe(x: number, w: number, reliable: boolean) {
    this.any.observe(x, w);
    // A frame that was barely trusted (moving, or the uncertain first one)
    // is not reliable evidence however it is posed.
    if (reliable && w >= HEAD_CALIBRATION.minimumReferenceFrameWeight) this.reference.observe(x, w);
  }
  reset() {
    this.any.reset();
    this.reference.reset();
  }
}

/** Landmarks every measurement needs; without all of them the frame is skipped. */
const REQUIRED_LANDMARKS = [
  LM.noseBridge,
  LM.leftEyeOuter,
  LM.leftEyeInner,
  LM.rightEyeInner,
  LM.rightEyeOuter,
  LM.leftTemple,
  LM.rightTemple,
  LM.forehead,
  LM.chin,
] as const;

const KEY_LANDMARKS = [
  LM.noseBridge,
  LM.leftEyeOuter,
  LM.rightEyeOuter,
  LM.leftTemple,
  LM.rightTemple,
  LM.leftEyeInner,
  LM.rightEyeInner,
] as const;

export class HeadFrameTracker {
  readonly frame: HeadFrame = {
    origin: new Vector3(),
    quaternion: new Quaternion(),
    anchor: new Vector3(),
    anchorOffset: new Vector3(),
    lensSpanCm: 0,
    faceWidthCm: 0,
    earZ: 0,
    pupilY: 0,
    foreheadY: 0,
    faceHeightCm: 0,
    state: "searching",
    confidence: 0,
    basis: "turned",
    frameReliable: false,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    matrixScale: 1,
    headLandmarks: new Float32Array(478 * 3),
    landmarkCount: 0,
    measurement: { lensSpanCm: 0, faceWidthCm: 0, outerEyeCm: 0, quality: 0, landmarkQuality: 0, visibilityMin: 1, outlierRun: 0 },
  };

  // Calibrated targets, in head space.
  private span = new Estimate();
  private faceWidth = new Estimate();
  private earZ = new Estimate();
  private pupilY = new Estimate();
  private foreheadY = new Estimate();
  private faceHeight = new Estimate();
  private nx = new Estimate();
  private ny = new Estimate();
  private nz = new Estimate();

  // Applied values: what the scene actually uses, approaching the targets smoothly.
  private applied: {
    span: number;
    faceWidth: number;
    earZ: number;
    pupilY: number;
    foreheadY: number;
    faceHeight: number;
    nx: number;
    ny: number;
    nz: number;
  } | null = null;
  private lastTimestamp: number | null = null;
  private outlierRun = 0;
  // Previous head rotation, for the angular speed that down-weights moving frames.
  private prevQuaternion = new Quaternion();
  private prevPoseTime: number | null = null;
  // Landmark signature of the previous call, to recognise the same camera frame arriving again.
  private prevSignature = new Float64Array(9);
  private hasPrevSignature = false;

  private scale = new Vector3();
  private inverseRotation = new Quaternion();
  private euler = new Euler();
  private tmp = new Vector3();
  private pL = new Vector3();
  private pR = new Vector3();
  private p168 = new Vector3();
  private p234 = new Vector3();
  private p454 = new Vector3();
  private p33 = new Vector3();
  private p263 = new Vector3();

  /** Forgets the person — used when the face is lost long enough that it may be someone else. */
  reset() {
    for (const e of [this.span, this.faceWidth, this.earZ, this.pupilY, this.foreheadY, this.faceHeight, this.nx, this.ny, this.nz]) e.reset();
    this.applied = null;
    this.lastTimestamp = null;
    this.outlierRun = 0;
    this.prevPoseTime = null;
    this.hasPrevSignature = false;
    this.frame.state = "searching";
    this.frame.confidence = 0;
  }

  /**
   * True when these landmarks are bit-for-bit those of the previous call: the
   * camera has not produced a new frame yet, so there is nothing new to learn
   * from it. Counting such repeats as fresh observations would make a single
   * noisy measurement look like settled evidence.
   */
  private isRepeatOfLastFrame(lm: ReadonlyArray<NormalizedPoint>): boolean {
    const keys = [LM.noseBridge, LM.leftEyeOuter, LM.rightEyeOuter] as const;
    let same = this.hasPrevSignature;
    for (let k = 0; k < keys.length; k++) {
      const p = lm[keys[k]];
      const x = p.x, y = p.y, z = p.z ?? 0;
      if (same && (this.prevSignature[k * 3] !== x || this.prevSignature[k * 3 + 1] !== y || this.prevSignature[k * 3 + 2] !== z)) same = false;
      this.prevSignature[k * 3] = x;
      this.prevSignature[k * 3 + 1] = y;
      this.prevSignature[k * 3 + 2] = z;
    }
    this.hasPrevSignature = true;
    return same;
  }

  /** Lifts landmark `i` into camera space, then head space, writing into `out`. */
  private toHead(
    lm: ReadonlyArray<NormalizedPoint>,
    i: number,
    distance: number,
    halfW0: number,
    halfH0: number,
    viewportW0: number,
    out: Vector3
  ) {
    const p = lm[i];
    // z has the same scale as x; negative is nearer the camera.
    const depth = distance + (p.z ?? 0) * viewportW0;
    const k = depth / distance;
    out.set((p.x * 2 - 1) * halfW0 * k, -(p.y * 2 - 1) * halfH0 * k, -depth);
    out.sub(this.frame.origin).applyQuaternion(this.inverseRotation);
    if (this.frame.matrixScale > 0 && Math.abs(this.frame.matrixScale - 1) > 1e-3) out.divideScalar(this.frame.matrixScale);
  }

  /** Returns false when the frame can't be placed from this input. */
  update(input: HeadFrameInput): boolean {
    const f = this.frame;
    const lm = input.landmarks;
    input.matrix.decompose(f.origin, f.quaternion, this.scale);
    f.matrixScale = (this.scale.x + this.scale.y + this.scale.z) / 3;
    const distance = -f.origin.z;
    if (!(distance > 0) || !Number.isFinite(distance)) return false;
    // The landmarks the measurements need must all be there.
    for (const key of REQUIRED_LANDMARKS) if (!lm[key]) return false;

    const halfH0 = distance * Math.tan(MathUtils.DEG2RAD * input.verticalFovDeg * 0.5);
    const halfW0 = halfH0 * input.aspect;
    const viewportW0 = halfW0 * 2;

    // Head rotation as a person would describe it. YXZ keeps yaw (about the
    // vertical) separate and stays meaningful at large yaw.
    this.euler.setFromQuaternion(f.quaternion, "YXZ");
    f.yawDeg = MathUtils.RAD2DEG * this.euler.y;
    f.pitchDeg = MathUtils.RAD2DEG * this.euler.x;
    f.rollDeg = MathUtils.RAD2DEG * this.euler.z;

    this.inverseRotation.copy(f.quaternion).invert();

    // Landmarks into head space. The full mesh (the occluder needs all 468)
    // when MediaPipe supplied it; otherwise just the ones the measurements
    // use — the synthetic test page provides only a handful.
    const fullMesh = lm.length >= 468 && lm[100] !== undefined && lm[300] !== undefined;
    const count = fullMesh ? Math.min(lm.length, 478) : 0;
    const lift = (i: number) => {
      if (!lm[i]) return;
      this.toHead(lm, i, distance, halfW0, halfH0, viewportW0, this.tmp);
      f.headLandmarks[i * 3] = this.tmp.x;
      f.headLandmarks[i * 3 + 1] = this.tmp.y;
      f.headLandmarks[i * 3 + 2] = this.tmp.z;
    };
    if (fullMesh) for (let i = 0; i < count; i++) lift(i);
    else for (const i of REQUIRED_LANDMARKS) lift(i);
    f.landmarkCount = count;
    const head = f.headLandmarks;
    const at = (i: number, out: Vector3) => out.set(head[i * 3], head[i * 3 + 1], head[i * 3 + 2]);
    if (!fullMesh) {
      lift(LM.leftIris);
      lift(LM.rightIris);
    }

    // Pupils: iris centres when the model provides them, else eye-corner midpoints.
    const hasIris = !!lm[LM.leftIris] && !!lm[LM.rightIris];
    if (hasIris) {
      at(LM.leftIris, this.pL);
      at(LM.rightIris, this.pR);
    } else {
      at(LM.leftEyeOuter, this.p33);
      at(LM.leftEyeInner, this.tmp);
      this.pL.copy(this.p33).add(this.tmp).multiplyScalar(0.5);
      at(LM.rightEyeInner, this.tmp);
      at(LM.rightEyeOuter, this.p263);
      this.pR.copy(this.tmp).add(this.p263).multiplyScalar(0.5);
    }
    at(LM.leftEyeOuter, this.p33);
    at(LM.rightEyeOuter, this.p263);
    at(LM.noseBridge, this.p168);
    at(LM.leftTemple, this.p234);
    at(LM.rightTemple, this.p454);

    const spanRaw = Math.abs(this.pR.x - this.pL.x);
    const faceWidthRaw = Math.abs(this.p454.x - this.p234.x);
    const outerEye = this.p33.distanceTo(this.p263);
    const earZRaw = (this.p234.z + this.p454.z) / 2;
    const pupilYRaw = (this.pL.y + this.pR.y) / 2;
    const foreheadYRaw = head[LM.forehead * 3 + 1];
    const faceHeightRaw = foreheadYRaw - head[LM.chin * 3 + 1];
    // Centred between the pupils, so each lens lands on its own eye. (The old
    // 2D version pulled this toward the nasion to steady a noisy yaw; in head
    // space there is nothing to steady, and on an asymmetric face the pull
    // would shift one lens off its eye.)
    const nxRaw = (this.pL.x + this.pR.x) / 2;
    const nyRaw = pupilYRaw;
    const nzRaw = this.p168.z;

    // --- How far this frame can be trusted --------------------------------
    // Landmark quality, independent of pose: the face has to be fully inside
    // the image (a cut-off face yields clamped, wrong landmarks) and the
    // geometry has to be a plausible pair of eyes. MediaPipe's own
    // per-landmark visibility is used if it is actually reported.
    let landmarkQuality = 1;
    let visibilityMin = 1;
    const m = HEAD_CALIBRATION.edgeMargin;
    for (const key of KEY_LANDMARKS) {
      const p = lm[key];
      if (!p || p.x < m || p.x > 1 - m || p.y < m || p.y > 1 - m) landmarkQuality = 0;
      if (typeof p?.visibility === "number" && p.visibility > 0) visibilityMin = Math.min(visibilityMin, p.visibility);
    }
    landmarkQuality *= visibilityMin;
    if (!(spanRaw > 1e-3) || !(faceWidthRaw > 1e-3)) landmarkQuality = 0;
    else {
      if (Math.abs(this.pR.y - this.pL.y) / spanRaw > HEAD_CALIBRATION.pupilTiltMax) landmarkQuality = 0;
      if (Math.abs(this.pR.z - this.pL.z) / spanRaw > HEAD_CALIBRATION.pupilDepthMax) landmarkQuality = 0;
      // The eyes sit well inside the temples; anything else is a bad fit.
      if (spanRaw / faceWidthRaw < 0.3 || spanRaw / faceWidthRaw > 0.85) landmarkQuality = 0;
      // Forehead above chin, and a head that is neither absurdly tall nor flat.
      const heightRatio = faceHeightRaw / faceWidthRaw;
      if (!(heightRatio > 0.6 && heightRatio < 2)) landmarkQuality = 0;
    }

    // How frontal: a turned head gives noisier depth, so it counts for less,
    // but is never discarded — a person who starts turned still calibrates.
    const frontal = Math.max(0, Math.cos(this.euler.y) * Math.cos(this.euler.x));
    let quality = landmarkQuality * Math.pow(frontal, HEAD_CALIBRATION.frontalExponent);

    // How still: a head in motion is measured against a lagging pose matrix.
    if (this.prevPoseTime !== null) {
      const dtPose = MathUtils.clamp((input.timestampMs - this.prevPoseTime) / 1000, 1 / 240, 0.25);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(f.quaternion.dot(this.prevQuaternion))));
      const omega = angle / dtPose;
      quality /= 1 + (omega / HEAD_CALIBRATION.motionRadPerSecond) ** 4;
    } else {
      quality *= HEAD_CALIBRATION.unknownMotionWeight;
    }
    this.prevQuaternion.copy(f.quaternion);
    this.prevPoseTime = input.timestampMs;

    // The same camera frame again carries no new evidence.
    if (this.isRepeatOfLastFrame(lm)) quality = 0;

    // A reliable observation: facing the camera closely enough that the
    // head-space lift is trustworthy (see `reliableYawDeg`).
    const reliable =
      Math.abs(f.yawDeg) <= HEAD_CALIBRATION.reliableYawDeg && Math.abs(f.pitchDeg) <= HEAD_CALIBRATION.reliablePitchDeg;

    // Outlier / new-face handling, once there is settled reference evidence to
    // compare with. Only reliable frames are judged: a turned frame is
    // expected to read low, which is not evidence of a different person.
    if (reliable && this.span.reliableWeight >= HEAD_CALIBRATION.settledWeight && quality > 0) {
      const off = Math.abs(spanRaw - this.span.value) / this.span.value;
      if (off > HEAD_CALIBRATION.outlierRelative) {
        this.outlierRun++;
        quality = 0;
        if (this.outlierRun >= HEAD_CALIBRATION.newFaceFrames) this.reset();
      } else {
        this.outlierRun = 0;
      }
    }

    this.span.observe(spanRaw, quality, reliable);
    this.faceWidth.observe(faceWidthRaw, quality, reliable);
    this.earZ.observe(earZRaw, quality, reliable);
    this.pupilY.observe(pupilYRaw, quality, reliable);
    this.foreheadY.observe(foreheadYRaw, quality, reliable);
    this.faceHeight.observe(faceHeightRaw, quality, reliable);
    this.nx.observe(nxRaw, quality, reliable);
    this.ny.observe(nyRaw, quality, reliable);
    this.nz.observe(nzRaw, quality, reliable);

    f.measurement = {
      lensSpanCm: spanRaw,
      faceWidthCm: faceWidthRaw,
      outerEyeCm: outerEye,
      quality,
      landmarkQuality,
      visibilityMin,
      outlierRun: this.outlierRun,
    };

    // Nothing trustworthy seen yet (e.g. the face started cut off): wait,
    // rather than place the glasses from a bad measurement.
    if (!(this.span.weight >= HEAD_CALIBRATION.minimumWeight) || this.span.count < HEAD_CALIBRATION.minimumObservations) {
      f.state = "searching";
      f.confidence = 0;
      return false;
    }
    // "Calibrated" is earned only by reliable (facing-the-camera) evidence; a
    // person who has only ever been seen turned stays provisional however
    // many frames pass, because those frames read the face too small.
    f.state = this.span.reliableWeight >= HEAD_CALIBRATION.settledWeight ? "calibrated" : "provisional";
    f.confidence = Math.min(1, this.span.reliableWeight / HEAD_CALIBRATION.settledWeight);
    f.basis = this.span.usingReference ? "frontal" : "turned";
    f.frameReliable = reliable;

    // --- Applied values: approach the targets smoothly, never jump ---------
    const dt = this.lastTimestamp === null ? 0 : MathUtils.clamp((input.timestampMs - this.lastTimestamp) / 1000, 1 / 240, 0.25);
    this.lastTimestamp = input.timestampMs;
    const target = {
      span: this.span.value,
      faceWidth: this.faceWidth.value,
      earZ: this.earZ.value,
      pupilY: this.pupilY.value,
      foreheadY: this.foreheadY.value,
      faceHeight: this.faceHeight.value,
      nx: this.nx.value,
      ny: this.ny.value,
      nz: this.nz.value,
    };
    if (!this.applied || dt === 0) {
      this.applied = { ...target };
    } else {
      const a = 1 - Math.exp(-dt / HEAD_CALIBRATION.applyTauSeconds);
      const maxStep = this.applied.span * HEAD_CALIBRATION.maxRelativeRatePerSecond * dt;
      const step = (current: number, goal: number) => current + MathUtils.clamp((goal - current) * a, -maxStep, maxStep);
      const ap = this.applied;
      ap.span = step(ap.span, target.span);
      ap.faceWidth = step(ap.faceWidth, target.faceWidth);
      ap.earZ = step(ap.earZ, target.earZ);
      ap.pupilY = step(ap.pupilY, target.pupilY);
      ap.foreheadY = step(ap.foreheadY, target.foreheadY);
      ap.faceHeight = step(ap.faceHeight, target.faceHeight);
      ap.nx = step(ap.nx, target.nx);
      ap.ny = step(ap.ny, target.ny);
      ap.nz = step(ap.nz, target.nz);
    }
    const ap = this.applied;
    f.lensSpanCm = ap.span;
    f.faceWidthCm = ap.faceWidth;
    f.earZ = ap.earZ;
    f.pupilY = ap.pupilY;
    f.foreheadY = ap.foreheadY;
    f.faceHeightCm = ap.faceHeight;
    f.anchorOffset.set(ap.nx, ap.ny, ap.nz + HEAD_CALIBRATION.standoffRatio * ap.span);

    // The rigid attachment: the head's origin, plus the calibrated offset
    // carried by the head's own rotation.
    f.anchor.copy(f.anchorOffset).applyQuaternion(f.quaternion).add(f.origin);
    return f.lensSpanCm > 0 && f.faceWidthCm > 0;
  }
}
