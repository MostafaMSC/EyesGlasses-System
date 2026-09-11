import { Matrix4, Quaternion, Vector3 } from "three";
import { ChannelSmoother } from "@/lib/oneEuroFilter";

/**
 * The 4x4 head-pose matrix MediaPipe emits when the Face Landmarker runs with
 * `outputFacialTransformationMatrixes`. It maps MediaPipe's *canonical face
 * model* — a fixed, metric (centimetre-scale) head — onto the face it actually
 * detected, so anything positioned in canonical-face space follows the real
 * head in 3D for free.
 */
export interface MediapipeMatrix {
  rows: number;
  columns: number;
  data: number[];
}

/**
 * Vertical field of view, in degrees, of the virtual camera MediaPipe's face
 * geometry is solved against. The pose matrix is only consistent with a camera
 * using these intrinsics, so the Three.js PerspectiveCamera has to match or
 * the frame drifts away from the eyes as the head moves off-centre.
 */
export const MEDIAPIPE_VERTICAL_FOV_DEG = 63;
/** Canonical face space is in centimetres, so the frustum is too. */
export const MEDIAPIPE_NEAR = 1;
export const MEDIAPIPE_FAR = 10000;

/**
 * Reads MediaPipe's matrix into a Three.js `Matrix4`, detecting the storage
 * order rather than assuming it.
 *
 * MediaPipe's protobuf carries an explicit row/column-major layout flag, but
 * the JS binding drops it and hands over a bare 16-number array — and the
 * order has differed between builds. Guessing wrong transposes the rotation,
 * which makes the head appear to turn the *opposite* way: very broken, but
 * only visible with a real face in front of a camera, so it can't be caught
 * by a unit test.
 *
 * A head-pose matrix is rigid, so it is self-describing: the rotation entries
 * are all within [-1, 1] while the translation is the distance to the face in
 * centimetres (tens of units, dominated by a large negative Z). Whichever of
 * the two candidate slots holds the big numbers is the translation, and that
 * identifies the layout.
 */
export function faceMatrixToThree(matrix: MediapipeMatrix, out: Matrix4): boolean {
  const d = matrix.data;
  if (!d || d.length < 16) return false;

  const rowMajorTranslation = Math.abs(d[3]) + Math.abs(d[7]) + Math.abs(d[11]);
  const columnMajorTranslation = Math.abs(d[12]) + Math.abs(d[13]) + Math.abs(d[14]);

  // `fromArray` reads column-major (the WebGL convention Three.js stores
  // internally), so row-major data needs transposing back.
  out.fromArray(d);
  if (rowMajorTranslation > columnMajorTranslation) out.transpose();

  // A face behind the camera means the solve failed; better to drop the frame
  // than to render the frame somewhere absurd.
  const z = out.elements[14];
  return Number.isFinite(z) && z < 0;
}

type MatrixChannel = "x" | "y" | "z" | "scale" | "qx" | "qy" | "qz" | "qw";

/**
 * Translation is in centimetres at arm's length, so it needs a much looser
 * cutoff than rotation to avoid lag; rotation in quaternion components is a
 * tiny, very jitter-prone signal and can be smoothed hard.
 */
const MATRIX_SMOOTHING: Partial<Record<MatrixChannel, { minCutoff: number; beta: number }>> = {
  x: { minCutoff: 2.4, beta: 0.09 },
  y: { minCutoff: 2.4, beta: 0.09 },
  z: { minCutoff: 1.6, beta: 0.05 },
  scale: { minCutoff: 1.0, beta: 0.02 },
  qx: { minCutoff: 1.5, beta: 0.05 },
  qy: { minCutoff: 1.5, beta: 0.05 },
  qz: { minCutoff: 1.5, beta: 0.05 },
  qw: { minCutoff: 1.5, beta: 0.05 },
};

/**
 * Smooths the head-pose matrix the same way `FacePoseSmoother` smooths the 2D
 * pose: per-channel One Euro filtering, so the frame stops jittering when the
 * head is still without lagging behind when it moves.
 *
 * Filtering the matrix entries directly would shear and scale the frame (a
 * blend of two rotation matrices is not a rotation matrix), so it is split
 * into translation / rotation / uniform scale first and rebuilt afterwards.
 */
export class FaceMatrixSmoother {
  private smoother = new ChannelSmoother<MatrixChannel>(MATRIX_SMOOTHING);
  private position = new Vector3();
  private quaternion = new Quaternion();
  private scale = new Vector3();
  private smoothedQuaternion = new Quaternion();
  private hasPrevious = false;

  reset() {
    this.smoother.reset();
    this.hasPrevious = false;
  }

  /** Smooths `matrix` in place. */
  smooth(matrix: Matrix4, timestampMs: number) {
    matrix.decompose(this.position, this.quaternion, this.scale);

    // q and -q are the same rotation, but filtering their components
    // independently is not sign-agnostic: an arbitrary sign flip between
    // frames would be smoothed as a rotation all the way around. Flip the
    // incoming quaternion into the same hemisphere as the last one first.
    if (this.hasPrevious && this.quaternion.dot(this.smoothedQuaternion) < 0) {
      this.quaternion.set(-this.quaternion.x, -this.quaternion.y, -this.quaternion.z, -this.quaternion.w);
    }

    this.position.set(
      this.smoother.smooth("x", this.position.x, timestampMs),
      this.smoother.smooth("y", this.position.y, timestampMs),
      this.smoother.smooth("z", this.position.z, timestampMs)
    );

    this.smoothedQuaternion
      .set(
        this.smoother.smooth("qx", this.quaternion.x, timestampMs),
        this.smoother.smooth("qy", this.quaternion.y, timestampMs),
        this.smoother.smooth("qz", this.quaternion.z, timestampMs),
        this.smoother.smooth("qw", this.quaternion.w, timestampMs)
      )
      .normalize();
    this.hasPrevious = true;

    // MediaPipe's pose is rigid, so any scale is uniform — smoothing one
    // channel keeps it that way instead of letting the axes drift apart.
    const uniformScale = this.smoother.smooth("scale", (this.scale.x + this.scale.y + this.scale.z) / 3, timestampMs);
    this.scale.setScalar(uniformScale);

    matrix.compose(this.position, this.smoothedQuaternion, this.scale);
  }
}

