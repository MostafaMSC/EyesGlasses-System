import {
  AmbientLight,
  DirectionalLight,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  FaceMatrixSmoother,
  faceMatrixToThree,
  MEDIAPIPE_FAR,
  MEDIAPIPE_NEAR,
  MEDIAPIPE_VERTICAL_FOV_DEG,
  type MediapipeMatrix,
} from "@/lib/threeTryOn/faceMatrix";
import { FaceOccluder } from "@/lib/threeTryOn/faceOccluder";
import { HeadFrameTracker, LM, type HeadFrame } from "@/lib/threeTryOn/headFrame";
import type { GlassesModel } from "@/lib/threeTryOn/glassesModel";
import type { NormalizedPoint } from "@/lib/faceGeometry";

/**
 * Everything needed to place the frame for one video frame. Rotation and
 * depth come from MediaPipe's head-pose matrix; the landmarks say where on
 * that head the frame rests and how big it is — measured in head space and
 * calibrated progressively, see `HeadFrameTracker`.
 */
export interface FaceFrameInput {
  /**
   * MediaPipe's raw head-pose matrix. Converted and smoothed in here, so
   * callers never need to touch Three.js — which keeps the whole 3D stack out
   * of the main bundle for anyone who only ever uses the 2D overlay.
   */
  matrixData: MediapipeMatrix;
  /** Frame timestamp, for the smoothers. */
  timestampMs: number;
  /** The face's landmarks, as MediaPipe returned them (normalised, with z). */
  landmarks: ReadonlyArray<NormalizedPoint>;
  /**
   * Per-product tuning: a size multiplier, offsets in frame widths / heights,
   * roll in degrees. Applied per frame, on top of the person's calibrated
   * measurements — so switching product never has to re-calibrate.
   */
  scale: number;
  offsetX: number;
  offsetY: number;
  rollOffsetDeg: number;
}

/**
 * A face missing for longer than this may be a different person, so the
 * calibration is dropped. Shorter than this — a hand across the face, a
 * glance away, a blink of lost tracking — it is kept, so the glasses come
 * back exactly where they were instead of re-measuring and shifting.
 */
const LOSS_FORGET_MS = 4000;

/** A point of interest projected back onto the video, for the debug overlay. */
export interface DebugPoint {
  u: number;
  v: number;
}

/** What the development overlay draws. Reused every frame, never reallocated. */
export interface TryOnDebugInfo {
  /** The landmarks the head frame is built from, keyed by index. */
  landmarks: Record<number, DebugPoint>;
  faceCentre: DebugPoint;
  eyeCentre: DebugPoint;
  anchor: DebugPoint;
  /** Tips of the head's right / up / forward axes, 3 cm from the anchor. */
  axisRight: DebugPoint;
  axisUp: DebugPoint;
  axisForward: DebugPoint;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Outer eye corners (33↔263), 3D, in head space, centimetres. */
  ipdCm: number;
  /** Calibrated (applied) values, centimetres. */
  lensSpanCm: number;
  frameWidthCm: number;
  faceWidthCm: number;
  /** This frame's own raw measurements, centimetres. */
  lensSpanRawCm: number;
  faceWidthRawCm: number;
  modelScale: number;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  distanceCm: number;
  calibrated: boolean;
  calibrationState: string;
  calibrationConfidence: number;
  /** "frontal" when the fit rests on facing-the-camera frames, "turned" when only turned frames have been seen. */
  calibrationBasis: string;
  /** Whether this frame's pose counted as a reliable observation. */
  frameReliable: boolean;
  /** How much this frame contributed to calibration, 0..1, and the pose-independent part of that. */
  quality: number;
  landmarkQuality: number;
  /** Lowest per-landmark visibility MediaPipe reported (1 when it reports none). */
  visibilityMin: number;
  matrixScale: number;
  /** Projected anchor-to-pupil-midpoint distance, as a fraction of the outer-eye distance on screen. */
  anchorToEyes: number;
  /** A few landmarks in head space (x, y, z; this frame, unsmoothed), for checking proportions. */
  headPoints: Record<number, [number, number, number]>;
  /** Lateral scale applied to the face mesh so it fits between the frame's arms (1 = not narrowed). */
  occluderFit: number;
  /** This frame's landmarks in head space (xyz triples, `headMeshCount` valid) — the live array, not a copy. */
  headMesh: Float32Array | null;
  headMeshCount: number;
  visible: boolean;
}

/** Landmarks reported in `TryOnDebugInfo.headPoints`: nose tip, chin, forehead, ears, bridge, pupils. */
const DEBUG_HEAD_POINTS = [1, 152, 10, 234, 454, 168, 468, 473, 33, 263] as const;

/**
 * Owns the WebGL canvas that sits on top of the camera feed: a transparent
 * overlay, a camera whose intrinsics match the ones MediaPipe solved the head
 * pose against, the glasses model, and the depth-only head the temple arms
 * disappear behind.
 *
 * Scene graph — the head transform is the one parent of everything, so the
 * glasses and the occluders turn as one rigid object:
 *
 *   head      positioned at the head origin, rotated with the pose
 *   ├ occluder   face mesh + cranium, in head space
 *   └ anchor     at the calibrated lens-centre point, in head space
 *       └ frame    uniform scale + per-product offsets
 *           └ model.root
 */
export class TryOnScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private head = new Group();
  private anchor = new Group();
  private frame = new Group();
  private occluder = new FaceOccluder();
  private environment: Texture | null = null;
  private model: GlassesModel | null = null;

  private poseMatrix = new Matrix4();
  private poseSmoother = new FaceMatrixSmoother();
  private headFrame = new HeadFrameTracker();
  private lostSince: number | null = null;
  private scratch = new Vector3();
  private scratchEuler = new Euler();

  /**
   * How trustworthy the current fit is — read by the UI to ask the person to
   * face the camera while the fit is only provisional.
   */
  fit(): { state: HeadFrame["state"]; confidence: number; basis: HeadFrame["basis"] } {
    const f = this.headFrame.frame;
    return { state: f.state, confidence: f.confidence, basis: f.basis };
  }

  /** Filled in by `update` whenever `collectDebug` is set; read by the debug overlay. */
  readonly debug: TryOnDebugInfo = {
    landmarks: {},
    faceCentre: { u: 0, v: 0 },
    eyeCentre: { u: 0, v: 0 },
    anchor: { u: 0, v: 0 },
    axisRight: { u: 0, v: 0 },
    axisUp: { u: 0, v: 0 },
    axisForward: { u: 0, v: 0 },
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    ipdCm: 0,
    lensSpanCm: 0,
    frameWidthCm: 0,
    faceWidthCm: 0,
    lensSpanRawCm: 0,
    faceWidthRawCm: 0,
    modelScale: 0,
    position: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    distanceCm: 0,
    calibrated: false,
    calibrationState: "searching",
    calibrationConfidence: 0,
    calibrationBasis: "turned",
    frameReliable: false,
    quality: 0,
    landmarkQuality: 0,
    visibilityMin: 1,
    matrixScale: 1,
    anchorToEyes: 0,
    headPoints: {},
    occluderFit: 1,
    headMesh: null,
    headMeshCount: 0,
    visible: false,
  };
  /** Set by the overlay when the development view is on; costs nothing otherwise. */
  collectDebug = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      // The camera feed shows through wherever nothing is drawn.
      premultipliedAlpha: true,
    });
    this.renderer.setClearAlpha(0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    // The cranium is cut off with a clipping plane, see `FaceOccluder`.
    this.renderer.localClippingEnabled = true;

    this.camera = new PerspectiveCamera(MEDIAPIPE_VERTICAL_FOV_DEG, 1, MEDIAPIPE_NEAR, MEDIAPIPE_FAR);

    // Eyewear is mostly dark acetate or polished metal, and metal renders
    // black without something to reflect — a small baked room gives it
    // somewhere to pick highlights up from, which is most of what makes a 3D
    // frame read as a real object rather than flat plastic.
    const pmrem = new PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environment;
    pmrem.dispose();

    this.scene.add(new AmbientLight(0xffffff, 1.1));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(0.4, 0.8, 1);
    this.scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(-0.6, -0.2, 0.7);
    this.scene.add(fill);

    this.head.add(this.occluder.group);
    this.anchor.add(this.frame);
    this.head.add(this.anchor);
    this.head.visible = false;
    this.scene.add(this.head);
  }

  /**
   * `cssWidth`/`cssHeight` are the on-screen size of the canvas, which must
   * cover exactly the same rectangle as the video for the 3D to line up with
   * the face. The camera's aspect follows the *video*, since that is the image
   * the landmarks were measured in.
   */
  resize(cssWidth: number, cssHeight: number, videoAspect: number) {
    if (!(cssWidth > 0) || !(cssHeight > 0) || !(videoAspect > 0)) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = videoAspect;
    this.camera.updateProjectionMatrix();
  }

  setModel(model: GlassesModel | null) {
    if (this.model?.root.parent === this.frame) this.frame.remove(this.model.root);
    this.model = model;
    if (model) this.frame.add(model.root);
  }

  /** Shows the occluder tinted instead of invisible — for judging its boundaries. */
  setOccluderVisible(on: boolean) {
    this.occluder.setVisualize(on);
  }

  /**
   * Hides the overlay when tracking is lost. The person's calibration is kept
   * through a short loss and only dropped after `LOSS_FORGET_MS`.
   */
  clearFace() {
    this.head.visible = false;
    this.debug.visible = false;
    this.poseSmoother.reset();
    this.occluder.reset();
    const now = performance.now();
    this.lostSince ??= now;
    if (now - this.lostSince > LOSS_FORGET_MS) this.headFrame.reset();
  }

  /** Returns false when the frame couldn't be placed, so the caller can react. */
  update(input: FaceFrameInput): boolean {
    if (!this.model) {
      this.head.visible = false;
      return false;
    }

    const matrix = this.poseMatrix;
    if (!faceMatrixToThree(input.matrixData, matrix)) {
      this.head.visible = false;
      return false;
    }
    this.poseSmoother.smooth(matrix, input.timestampMs);

    const placed = this.headFrame.update({
      matrix,
      landmarks: input.landmarks,
      verticalFovDeg: this.camera.fov,
      aspect: this.camera.aspect,
      timestampMs: input.timestampMs,
    });
    if (!placed) {
      this.head.visible = false;
      return false;
    }
    this.lostSince = null;
    const h = this.headFrame.frame;

    // The head transform: parent of the glasses and both occluders.
    this.head.position.copy(h.origin);
    this.head.quaternion.copy(h.quaternion);
    this.anchor.position.copy(h.anchorOffset);

    // One uniform scale, from the calibrated lens span in centimetres: the
    // model's lens span becomes the person's. Never per-axis, so the frame
    // can't stretch as the head turns — perspective alone changes its
    // on-screen size.
    const scale = this.model.lensSpan > 0 ? (h.lensSpanCm * input.scale) / this.model.lensSpan : 0;
    if (!(scale > 0) || !Number.isFinite(scale)) {
      this.head.visible = false;
      return false;
    }
    this.frame.scale.setScalar(scale);

    // Offsets are in frame widths/heights, matching the 2D path's units, and
    // are applied inside the head frame so they follow the head's tilt.
    this.frame.position.set(
      input.offsetX * this.model.width * scale,
      -input.offsetY * this.model.height * scale,
      0
    );
    this.frame.rotation.set(0, 0, MathUtils.DEG2RAD * input.rollOffsetDeg);

    if (this.collectDebug) {
      const parts = (window as unknown as { __tryOnOccluders?: string }).__tryOnOccluders;
      this.occluder.parts = parts === "face" || parts === "cranium" || parts === "none" ? parts : "both";
      this.occluder.tune = (window as unknown as { __tryOnTune?: { inset?: number; backoff?: number } }).__tryOnTune ?? null;
    }
    this.occluder.update(
      h,
      this.model.width * scale,
      h.measurement.landmarkQuality > 0,
      this.model.arms ? { profile: this.model.arms, scale } : null
    );

    this.head.visible = true;
    if (this.collectDebug) this.fillDebug(input, h, scale);
    return true;
  }

  /** Projects a camera-space point to normalised video coordinates (y down). */
  private project(point: Vector3, out: DebugPoint) {
    this.scratch.copy(point).project(this.camera);
    out.u = (this.scratch.x + 1) / 2;
    out.v = (1 - this.scratch.y) / 2;
  }

  private fillDebug(input: FaceFrameInput, h: HeadFrame, scale: number) {
    const d = this.debug;
    const lm = input.landmarks;
    for (const index of [LM.noseBridge, LM.noseTop, LM.leftEyeOuter, LM.rightEyeOuter, LM.leftTemple, LM.rightTemple]) {
      const p = lm[index];
      if (!p) continue;
      const slot = d.landmarks[index] ?? (d.landmarks[index] = { u: 0, v: 0 });
      slot.u = p.x;
      slot.v = p.y;
    }
    const eyeL = lm[LM.leftIris] ?? lm[LM.leftEyeOuter];
    const eyeR = lm[LM.rightIris] ?? lm[LM.rightEyeOuter];
    if (eyeL && eyeR) {
      d.eyeCentre.u = (eyeL.x + eyeR.x) / 2;
      d.eyeCentre.v = (eyeL.y + eyeR.y) / 2;
    }
    const templeL = lm[LM.leftTemple];
    const templeR = lm[LM.rightTemple];
    const forehead = lm[LM.forehead];
    const chin = lm[LM.chin];
    if (templeL && templeR && forehead && chin) {
      d.faceCentre.u = (templeL.x + templeR.x) / 2;
      d.faceCentre.v = (forehead.y + chin.y) / 2;
    }
    this.project(h.anchor, d.anchor);
    const axisLength = 3;
    this.scratch.set(axisLength, 0, 0).applyQuaternion(h.quaternion).add(h.anchor);
    this.project(this.scratch, d.axisRight);
    this.scratch.set(0, axisLength, 0).applyQuaternion(h.quaternion).add(h.anchor);
    this.project(this.scratch, d.axisUp);
    this.scratch.set(0, 0, axisLength).applyQuaternion(h.quaternion).add(h.anchor);
    this.project(this.scratch, d.axisForward);

    d.yawDeg = h.yawDeg;
    d.pitchDeg = h.pitchDeg;
    d.rollDeg = h.rollDeg;
    d.ipdCm = h.measurement.outerEyeCm;
    d.lensSpanCm = h.lensSpanCm;
    d.faceWidthCm = h.faceWidthCm;
    d.lensSpanRawCm = h.measurement.lensSpanCm;
    d.faceWidthRawCm = h.measurement.faceWidthCm;
    d.frameWidthCm = this.model ? this.model.width * scale : 0;
    d.modelScale = scale;
    d.distanceCm = -h.origin.z;
    d.calibrated = h.state === "calibrated";
    d.calibrationState = h.state;
    d.calibrationConfidence = h.confidence;
    d.calibrationBasis = h.basis;
    d.frameReliable = h.frameReliable;
    d.quality = h.measurement.quality;
    d.landmarkQuality = h.measurement.landmarkQuality;
    d.visibilityMin = h.measurement.visibilityMin;
    d.matrixScale = h.matrixScale;
    d.occluderFit = this.occluder.lateralFit;
    d.headMesh = h.headLandmarks;
    d.headMeshCount = h.landmarkCount;
    if (templeL && eyeL && eyeR && lm[LM.leftEyeOuter] && lm[LM.rightEyeOuter]) {
      const aspect = this.camera.aspect;
      const outer = Math.hypot(
        (lm[LM.rightEyeOuter].x - lm[LM.leftEyeOuter].x) * aspect,
        lm[LM.rightEyeOuter].y - lm[LM.leftEyeOuter].y
      );
      d.anchorToEyes = outer > 0 ? Math.hypot((d.anchor.u - d.eyeCentre.u) * aspect, d.anchor.v - d.eyeCentre.v) / outer : 0;
    }
    for (const i of DEBUG_HEAD_POINTS) {
      if (i >= h.landmarkCount) continue;
      const slot = d.headPoints[i] ?? (d.headPoints[i] = [0, 0, 0]);
      slot[0] = h.headLandmarks[i * 3];
      slot[1] = h.headLandmarks[i * 3 + 1];
      slot[2] = h.headLandmarks[i * 3 + 2];
    }
    d.position[0] = h.anchor.x;
    d.position[1] = h.anchor.y;
    d.position[2] = h.anchor.z;
    this.scratchEuler.setFromQuaternion(h.quaternion, "YXZ");
    d.rotationDeg[0] = MathUtils.RAD2DEG * this.scratchEuler.x;
    d.rotationDeg[1] = MathUtils.RAD2DEG * this.scratchEuler.y;
    d.rotationDeg[2] = MathUtils.RAD2DEG * this.scratchEuler.z;
    d.visible = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** The drawing buffer, for compositing the overlay into a captured photo. */
  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose() {
    this.setModel(null);
    this.occluder.dispose();
    this.environment?.dispose();
    this.renderer.dispose();
  }
}
