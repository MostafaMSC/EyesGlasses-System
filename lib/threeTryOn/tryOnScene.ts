import {
  AmbientLight,
  DirectionalLight,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  Quaternion,
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
import { fitScale, type GlassesModel } from "@/lib/threeTryOn/glassesModel";

/**
 * Everything needed to place the frame for one video frame. Position and size
 * come from the face landmarks (reusing the tuning the 2D path already has),
 * rotation and depth come from MediaPipe's head-pose matrix — the part 2D
 * could never represent.
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
  /** Lens-centre line, in normalized video coordinates (0..1, y down). */
  anchorU: number;
  anchorV: number;
  /**
   * Lens-centre span as it currently appears on screen, as a fraction of the
   * video's width — foreshortening included (`FacePose.projectedWidth`). The
   * head-on span is worked out in here by undoing the foreshortening of the
   * very rotation being rendered, so the two can't disagree.
   */
  projectedLensSpanFrac: number;
  /** Temple-to-temple face width, as a fraction of the video's width. */
  faceWidthFrac: number;
  /** Per-product tuning, in frame widths / heights / degrees. */
  offsetX: number;
  offsetY: number;
  rollOffsetDeg: number;
}

/**
 * The invisible head mask, as an ellipsoid, with every measurement expressed
 * in multiples of the face's own measured temple width so it adapts to the
 * person rather than assuming a head size.
 *
 * `halfWidth` is the delicate one. The mask has to be *narrower* than the line
 * the temple arms run along, or a head-on view would hide the arms that should
 * be visible beside the temples. But too narrow and the far arm pokes through
 * the head when the face turns. Real frames are built to match face width, so
 * there is not much margin — this is the first constant to adjust if arms
 * either vanish too early or show through the head.
 */
/**
 * Floor on the foreshortening factor. A profile view shortens the lens line
 * toward nothing, and dividing by that would blow the frame up to absurd size
 * off the back of a rounding error; past this angle the frame is edge-on
 * anyway, so holding the size is the better failure.
 */
const MIN_FORESHORTEN = 0.4;

export const HEAD_MASK = {
  halfWidth: 0.46,
  halfHeight: 0.78,
  halfDepth: 0.68,
  /** Centre offset below the lens line — a head's middle sits below the eyes. */
  centreY: -0.1,
  /**
   * Gap left between the lens plane and the front of the mask, so the mask can
   * never eat into the front rim or the lenses. Only things clearly behind the
   * lenses — the temple arms — are ever hidden by it.
   */
  frontClearance: 0.05,
};

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
  private scratchPosition = new Vector3();
  private scratchQuaternion = new Quaternion();
  private scratchScale = new Vector3();

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
    this.mask = new Mesh(
      new SphereGeometry(1, 28, 20),
      new MeshBasicMaterial({ colorWrite: false })
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
    this.poseSmoother.reset();
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

    // MediaPipe's camera looks down -Z, so the face sits at a negative Z and
    // its distance is that magnitude.
    const distance = Math.abs(matrix.elements[14]);
    if (!(distance > 0) || !Number.isFinite(distance)) {
      this.anchor.visible = false;
      return false;
    }

    // World extent of the video frame at the head's depth. Everything measured
    // as a fraction of the video's width converts through this, which is what
    // keeps the frame's on-screen size identical to the 2D path's.
    const halfHeightWorld = distance * Math.tan(MathUtils.DEG2RAD * this.camera.fov * 0.5);
    const halfWidthWorld = halfHeightWorld * this.camera.aspect;
    const viewportWidthWorld = halfWidthWorld * 2;

    // Cast a ray through the landmark anchor and put the frame on it at the
    // head's depth. Taking the position from the landmarks rather than from
    // the matrix's own translation keeps the carefully-tuned anchor (pupil
    // line pulled toward the nose bridge) that the 2D path already uses.
    this.anchor.position.set(
      (input.anchorU * 2 - 1) * halfWidthWorld,
      -(input.anchorV * 2 - 1) * halfHeightWorld,
      -distance
    );

    // Rotation — and only rotation — comes from the head-pose matrix.
    matrix.decompose(this.scratchPosition, this.scratchQuaternion, this.scratchScale);
    this.anchor.quaternion.copy(this.scratchQuaternion);

    // How much this rotation shortens the lens-centre line on screen. The
    // model's local X axis is the matrix's first column; the part of it that
    // survives into the screen plane is its X/Y length, and dividing by the
    // column's full length drops the uniform scale the matrix also carries.
    //
    // Derived from the rotation actually being rendered rather than from a
    // separately-estimated yaw, so the foreshortening cancels exactly instead
    // of leaving the frame to swell as the head turns. It also covers pitch
    // and roll for free, which a yaw-only cosine would not.
    const e = matrix.elements;
    const axisLength = Math.hypot(e[0], e[1], e[2]);
    const foreshorten = axisLength > 0 ? Math.hypot(e[0], e[1]) / axisLength : 1;

    const projectedSpanWorld = input.projectedLensSpanFrac * viewportWidthWorld;
    const lensSpanWorld = projectedSpanWorld / Math.max(foreshorten, MIN_FORESHORTEN);
    const scale = fitScale(this.model, lensSpanWorld);
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

    const faceWidthWorld = input.faceWidthFrac * viewportWidthWorld;
    this.mask.scale.set(
      HEAD_MASK.halfWidth * faceWidthWorld,
      HEAD_MASK.halfHeight * faceWidthWorld,
      HEAD_MASK.halfDepth * faceWidthWorld
    );
    this.mask.position.set(
      0,
      HEAD_MASK.centreY * faceWidthWorld,
      -(HEAD_MASK.halfDepth + HEAD_MASK.frontClearance) * faceWidthWorld
    );

    this.anchor.visible = true;
    return true;
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
