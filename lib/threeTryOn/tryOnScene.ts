import {
  AmbientLight,
  DirectionalLight,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  Plane,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
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
import { HEAD_MASK, HeadFrameTracker, LM, type HeadFrame } from "@/lib/threeTryOn/headFrame";
import type { GlassesModel } from "@/lib/threeTryOn/glassesModel";
import type { NormalizedPoint } from "@/lib/faceGeometry";

/**
 * Everything needed to place the frame for one video frame. Rotation and
 * depth come from MediaPipe's head-pose matrix; the landmarks say where on
 * that head the frame rests, and how big it is — measured while the head is
 * frontal and then held, see `HeadFrameTracker`.
 */
export interface FaceFrameInput {
  /**
   * MediaPipe's raw head-pose matrix. Converted and smoothed in here, so
   * callers never need to touch Three.js — which keeps the whole 3D stack out
   * of the main bundle for anyone who only ever uses the 2D overlay.
   */
  matrixData: MediapipeMatrix;
  /** Frame timestamp, for the pose smoother. */
  timestampMs: number;
  /** The face's landmarks, as MediaPipe returned them (normalised, with z). */
  landmarks: ReadonlyArray<NormalizedPoint>;
  /** Lens-centre line, in normalized video coordinates (0..1, y down). */
  anchorU: number;
  anchorV: number;
  /**
   * Lens-centre span as it currently appears on screen, as a fraction of the
   * video's width — foreshortening included (`FacePose.projectedWidth`).
   */
  projectedLensSpanFrac: number;
  /** Temple-to-temple face width, as a fraction of the video's width. */
  faceWidthFrac: number;
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
  /** Outer eye-corner distance and lens-centre span, centimetres. */
  ipdCm: number;
  lensSpanCm: number;
  frameWidthCm: number;
  faceWidthCm: number;
  modelScale: number;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  distanceCm: number;
  calibrated: boolean;
  visible: boolean;
}

/**
 * Owns the WebGL canvas that sits on top of the camera feed: a transparent
 * overlay, a camera whose intrinsics match the ones MediaPipe solved the head
 * pose against, the glasses model, and a depth-only head mask that gives the
 * temple arms somewhere to disappear behind.
 */
export class TryOnScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  /** Follows the head: positioned at the lens line, rotated with the pose. */
  private anchor = new Group();
  /** Holds the model, carrying only the fit scale and per-product offsets. */
  private frame = new Group();
  private mask: Mesh;
  private environment: Texture | null = null;
  private model: GlassesModel | null = null;

  private poseMatrix = new Matrix4();
  private poseSmoother = new FaceMatrixSmoother();
  private headFrame = new HeadFrameTracker();
  private maskClip = new Plane();
  private scratch = new Vector3();
  private scratchPoint = new Vector3();
  private scratchEuler = new Euler();

  /** Filled in by `update` whenever `debug` is set; read by the debug overlay. */
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
    modelScale: 0,
    position: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    distanceCm: 0,
    calibrated: false,
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

    this.camera = new PerspectiveCamera(
      MEDIAPIPE_VERTICAL_FOV_DEG,
      1,
      MEDIAPIPE_NEAR,
      MEDIAPIPE_FAR
    );

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

    // Writes depth but no colour: it punches the glasses' own pixels away
    // where the head is in front of them, while leaving the camera feed
    // untouched (nothing is painted, so those pixels stay transparent).
    // Clipped at the lens plane, see `placeMask`.
    this.renderer.localClippingEnabled = true;
    this.mask = new Mesh(
      new SphereGeometry(1, 28, 20),
      new MeshBasicMaterial({ colorWrite: false, clippingPlanes: [this.maskClip] })
    );
    // Drawn before the frame, so the frame's fragments are the ones tested
    // against it.
    this.mask.renderOrder = -1;
    this.anchor.add(this.mask);

    this.anchor.add(this.frame);
    this.anchor.visible = false;
    this.scene.add(this.anchor);
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

  /** Hides the overlay without tearing anything down — used when tracking is lost. */
  clearFace() {
    this.anchor.visible = false;
    this.debug.visible = false;
    this.poseSmoother.reset();
    // A new face (or the same one after a gap) is re-measured from scratch:
    // the constants belong to a person, not to the session.
    this.headFrame.reset();
  }

  /** Returns false when the frame couldn't be placed, so the caller can react. */
  update(input: FaceFrameInput): boolean {
    if (!this.model) {
      this.anchor.visible = false;
      return false;
    }

    const matrix = this.poseMatrix;
    if (!faceMatrixToThree(input.matrixData, matrix)) {
      this.anchor.visible = false;
      return false;
    }
    this.poseSmoother.smooth(matrix, input.timestampMs);

    const placed = this.headFrame.update({
      matrix,
      landmarks: input.landmarks,
      anchorU: input.anchorU,
      anchorV: input.anchorV,
      projectedLensSpanFrac: input.projectedLensSpanFrac,
      faceWidthFrac: input.faceWidthFrac,
      verticalFovDeg: this.camera.fov,
      aspect: this.camera.aspect,
    });
    if (!placed) {
      this.anchor.visible = false;
      return false;
    }
    const head = this.headFrame.frame;

    // The rigid attachment: the anchor group *is* the head frame, placed at
    // the nose bridge. Everything inside it — frame, offsets, mask — is in
    // head space and turns with the head as one object.
    this.anchor.position.copy(head.anchor);
    this.anchor.quaternion.copy(head.quaternion);

    // One uniform scale, from a calibrated width in centimetres: the model's
    // lens span becomes the person's. Never per-axis, so the frame can't
    // stretch as the head turns — perspective alone changes its on-screen size.
    const scale = this.model.lensSpan > 0 ? (head.lensSpanCm * input.scale) / this.model.lensSpan : 0;
    if (!(scale > 0) || !Number.isFinite(scale)) {
      this.anchor.visible = false;
      return false;
    }
    this.frame.scale.setScalar(scale);

    // Offsets are in frame widths/heights, matching the 2D path's units, and
    // are applied inside the anchor so they follow the head's tilt.
    this.frame.position.set(
      input.offsetX * this.model.width * scale,
      -input.offsetY * this.model.height * scale,
      0
    );
    this.frame.rotation.set(0, 0, MathUtils.DEG2RAD * input.rollOffsetDeg);

    this.placeMask(head);

    this.anchor.visible = true;
    if (this.collectDebug) this.fillDebug(input, head, scale);
    return true;
  }

  /**
   * The head mask in head space: a skull-sized ellipsoid behind the nose
   * bridge (the anchor group's origin), cut off at a plane behind the lenses.
   */
  private placeMask(head: HeadFrame) {
    const w = head.faceWidthCm;
    this.mask.scale.set(HEAD_MASK.halfWidth * w, HEAD_MASK.halfHeight * w, HEAD_MASK.halfDepth * w);
    this.mask.position.set(0, HEAD_MASK.centreY * w, -HEAD_MASK.centreBack * w);
    // The cut: discard the sliver of the mask in front of the clearance
    // plane (toward the face — where it must never occlude the rim/bridge),
    // keep everything behind it (the skull volume the far temple arm
    // actually needs to disappear behind).
    //
    // Three.js discards fragments on the side its `normal` points to, so
    // that normal has to point *toward the face* (local +Z — mixing this up
    // silently inverts the whole mask: it then keeps only a useless front
    // sliver and discards the skull volume, so nothing ever occludes the
    // far arm). Clipping planes are world-space, so the plane is rebuilt
    // from the head's current rotation every frame.
    this.scratch.set(0, 0, 1).applyQuaternion(head.quaternion);
    this.scratchPoint.set(0, 0, -HEAD_MASK.frontClearance * w).applyQuaternion(head.quaternion).add(head.anchor);
    this.maskClip.setFromNormalAndCoplanarPoint(this.scratch, this.scratchPoint);
  }

  /** Projects a camera-space point to normalised video coordinates (y down). */
  private project(point: Vector3, out: DebugPoint) {
    this.scratch.copy(point).project(this.camera);
    out.u = (this.scratch.x + 1) / 2;
    out.v = (1 - this.scratch.y) / 2;
  }

  private fillDebug(input: FaceFrameInput, head: HeadFrame, scale: number) {
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
    this.project(head.anchor, d.anchor);
    const axisLength = 3;
    this.scratch.set(axisLength, 0, 0).applyQuaternion(head.quaternion).add(head.anchor);
    this.project(this.scratch, d.axisRight);
    this.scratch.set(0, axisLength, 0).applyQuaternion(head.quaternion).add(head.anchor);
    this.project(this.scratch, d.axisUp);
    this.scratch.set(0, 0, axisLength).applyQuaternion(head.quaternion).add(head.anchor);
    this.project(this.scratch, d.axisForward);

    d.yawDeg = head.yawDeg;
    d.pitchDeg = head.pitchDeg;
    d.rollDeg = head.rollDeg;
    d.lensSpanCm = head.lensSpanCm;
    d.faceWidthCm = head.faceWidthCm;
    d.frameWidthCm = this.model ? this.model.width * scale : 0;
    d.modelScale = scale;
    d.distanceCm = -head.origin.z;
    d.calibrated = head.calibrated;
    const outerL = lm[LM.leftEyeOuter];
    const outerR = lm[LM.rightEyeOuter];
    if (outerL && outerR) {
      // Outer-corner distance at the bridge's depth, in the same centimetres.
      const halfHeightWorld = d.distanceCm * Math.tan(MathUtils.DEG2RAD * this.camera.fov * 0.5);
      const viewportWidthWorld = halfHeightWorld * this.camera.aspect * 2;
      d.ipdCm = Math.hypot((outerR.x - outerL.x) * viewportWidthWorld, (outerR.y - outerL.y) * viewportWidthWorld / this.camera.aspect);
    }
    d.position[0] = head.anchor.x;
    d.position[1] = head.anchor.y;
    d.position[2] = head.anchor.z;
    this.scratchEuler.setFromQuaternion(head.quaternion, "YXZ");
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
    this.mask.geometry.dispose();
    (this.mask.material as MeshBasicMaterial).dispose();
    this.environment?.dispose();
    this.renderer.dispose();
  }
}
