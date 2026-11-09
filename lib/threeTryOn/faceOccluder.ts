import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Plane,
  SphereGeometry,
  Vector3,
} from "three";
import { FACE_MESH_TRIANGLES } from "@/lib/threeTryOn/faceMeshTriangles";
import { armHalfWidthAt, type ArmProfile } from "@/lib/threeTryOn/glassesModel";
import type { HeadFrame } from "@/lib/threeTryOn/headFrame";

/** A frame's arm gap and the scale (centimetres per model unit) it is placed at. */
export interface ArmsInScene {
  profile: ArmProfile;
  scale: number;
}

/**
 * The invisible head the glasses go behind: it writes depth but no colour, so
 * temple arms vanish exactly where a real head would hide them while the
 * camera feed shows through untouched.
 *
 * Two parts, split on a measured landmark rather than a guessed constant:
 *
 * - **The face**: MediaPipe's own 468-point mesh, in head space, as a
 *   surface. It is the actual shape of this person's face — brow, nose,
 *   cheeks, eye sockets (the mesh's eye and mouth openings are closed in
 *   `faceMeshTriangles.ts`, or the far arm would show through the far eye).
 *   An ellipsoid cannot do this job: a face is much narrower in front than a
 *   skull, so any ellipsoid wide enough to hide the far arm at the temple
 *   also cuts into the near arm and the rims.
 * - **The cranium**: a skull-sized ellipsoid behind the ear line, for the
 *   side and back of the head the mesh does not cover. It is cut off at a
 *   plane just behind the ear landmarks (234/454) — in front of it the face
 *   mesh takes over — and is never wider than the frame, which sits outside
 *   the temples.
 *
 * Everything lives in head space and is drawn from the same head transform as
 * the glasses, so the two cannot drift apart.
 */

export const HEAD_OCCLUDER = {
  /**
   * The face surface is pushed back this far, as a fraction of the lens span,
   * so rims and nose pads resting on skin are never cut by landmark noise.
   */
  surfaceBackoff: 0.1,
  /** Fraction of the way each head-space vertex moves toward a new frame — averages out jitter. */
  vertexFollow: 0.25,
  /**
   * Cranium extents, from measured landmarks rather than a universal head:
   * it reaches below the pupil line by this fraction of the forehead-to-chin
   * distance, above the forehead landmark by this fraction of the
   * pupil-to-forehead distance, and behind the ear plane by this fraction of
   * the forehead-to-chin distance (head length behind the ears is close to
   * half the face's height).
   */
  craniumBelowPupils: 0.42,
  craniumAboveForehead: 0.5,
  craniumBehindEars: 0.5,
  /**
   * Landmarks 234/454 sit at the front of the ear (the temple-cheekbone
   * junction), not at the ear itself; the real ear is a little behind them.
   * The cranium starts this far behind that plane, as a fraction of the
   * forehead-to-chin distance, so the arm is visible all the way to the ear.
   */
  earPlaneBackoff: 0.08,
  /** Half-width, as a fraction of the measured temple width. */
  craniumHalfWidth: 0.51,
  /**
   * The head is held inside the gap between the frame's arms. `armClearance`
   * is how much of that gap it may fill; `frameClearance` is the fallback
   * when the model's arms can't be measured (as a fraction of frame width).
   */
  armClearance: 0.97,
  frameClearance: 0.92,
  /** The face is never narrowed below this fraction of its measured width. */
  minFit: 0.5,
  /**
   * Robustness: the lateral fit is set by this percentile of the per-vertex
   * limits, not the single worst vertex, so one noisy landmark can't pinch
   * the whole face. Followed with this fraction per frame so it never flickers.
   */
  fitPercentile: 0.04,
  fitFollow: 0.15,
} as const;

const VERTEX_COUNT = 468;

export class FaceOccluder {
  /** Add to a group positioned and rotated like the head. */
  readonly group = new Group();

  /** Development switch: which parts are active. Always "both" outside the debug view. */
  parts: "both" | "face" | "cranium" | "none" = "both";
  /** Development override of the face mesh's lateral scale and backoff; unset outside the debug view. */
  tune: { inset?: number; backoff?: number } | null = null;

  private face: Mesh;
  private cranium: Mesh;
  private tints: Mesh[] = [];
  private positions = new Float32Array(VERTEX_COUNT * 3);
  private positionAttribute: BufferAttribute;
  private haveMesh = false;
  private ratios = new Float32Array(VERTEX_COUNT);
  private fit = 1;
  private haveFit = false;
  private clip = new Plane();
  private tmpNormal = new Vector3();
  private tmpPoint = new Vector3();

  constructor() {
    const geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", this.positionAttribute);
    geometry.setIndex(new BufferAttribute(FACE_MESH_TRIANGLES, 1));

    this.face = new Mesh(
      geometry,
      new MeshBasicMaterial({
        colorWrite: false,
        side: DoubleSide,
        // A little extra depth bias on top of the physical backoff, against
        // z-fighting where the mesh and a rim are nearly coincident.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
    );
    // Vertices move every frame, so the geometry's own bounds are never right.
    this.face.frustumCulled = false;
    // Drawn before the frame, so the frame's fragments are tested against it.
    this.face.renderOrder = -1;
    this.face.visible = false;

    this.cranium = new Mesh(
      new SphereGeometry(1, 28, 20),
      new MeshBasicMaterial({ colorWrite: false, clippingPlanes: [this.clip] })
    );
    this.cranium.renderOrder = -1;

    this.group.add(this.face, this.cranium);
  }

  /** Current lateral scale of the face mesh (1 = as measured; less = narrowed to fit between the arms). */
  get lateralFit() {
    return this.fit;
  }

  /** The next frame's mesh snaps to its landmarks instead of easing from a stale face. */
  reset() {
    this.haveMesh = false;
    this.haveFit = false;
  }

  /**
   * How much the face mesh must be narrowed (as a lateral scale, ≤ 1) so that
   * at every depth it stays inside the gap between the frame's arms. Each
   * vertex states its own limit — the arms' inner half-width at its depth,
   * over its distance from the midline — and the fit is a low percentile of
   * those, so it follows the worst real constraint without being at the
   * mercy of one noisy landmark.
   */
  private armFit(head: HeadFrame, arms: ArmsInScene, backoffCm: number): number | null {
    let n = 0;
    const minX = 0.15 * head.faceWidthCm;
    for (let i = 0; i < VERTEX_COUNT; i++) {
      const x = Math.abs(this.positions[i * 3]);
      if (x < minX) continue; // near the midline: nothing there can touch an arm
      const modelZ = (this.positions[i * 3 + 2] - backoffCm - head.anchorOffset.z) / arms.scale;
      const gap = armHalfWidthAt(arms.profile, modelZ);
      if (!(gap > 0)) continue;
      this.ratios[n++] = (gap * arms.scale * HEAD_OCCLUDER.armClearance) / x;
    }
    if (n < 12) return null;
    const sorted = this.ratios.subarray(0, n);
    sorted.sort();
    return sorted[Math.floor(n * HEAD_OCCLUDER.fitPercentile)];
  }

  dispose() {
    for (const mesh of [this.face, this.cranium]) {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    for (const tint of this.tints) (tint.material as MeshBasicMaterial).dispose();
  }

  /**
   * Shows the occluders as a translucent tint — for judging their boundaries.
   * The tint is drawn on separate copies riding on the real meshes, so the
   * real ones stay depth-only and keep occluding exactly as they do in
   * production; a translucent occluder would be drawn after the glasses and
   * stop hiding anything.
   */
  setVisualize(on: boolean) {
    if (on && this.tints.length === 0) {
      for (const [mesh, colour, clipped] of [[this.face, "#22d3ee", false], [this.cranium, "#f472b6", true]] as const) {
        const tint = new Mesh(
          mesh.geometry,
          new MeshBasicMaterial({
            color: new Color(colour),
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            side: DoubleSide,
            clippingPlanes: clipped ? [this.clip] : null,
          })
        );
        tint.frustumCulled = false;
        tint.renderOrder = 2;
        mesh.add(tint);
        this.tints.push(tint);
      }
    }
    for (const tint of this.tints) tint.visible = on;
  }

  /**
   * `trustFrame`: whether this frame's landmarks are good enough to update the
   * mesh from. A face cut off by the image edge has clamped landmarks, and
   * feeding those in would dent the occluder — the last good mesh is kept.
   */
  update(head: HeadFrame, frameWidthCm: number, trustFrame: boolean, arms: ArmsInScene | null) {
    const w = head.faceWidthCm;
    const mesh = head.landmarkCount >= VERTEX_COUNT;

    if (mesh) {
      const src = head.headLandmarks;
      if (!this.haveMesh) {
        this.positions.set(src.subarray(0, VERTEX_COUNT * 3));
        this.haveMesh = true;
      } else if (trustFrame) {
        const k = HEAD_OCCLUDER.vertexFollow;
        for (let i = 0; i < VERTEX_COUNT * 3; i++) this.positions[i] += (src[i] - this.positions[i]) * k;
      }
      this.positionAttribute.needsUpdate = true;
      const backoff = (this.tune?.backoff ?? HEAD_OCCLUDER.surfaceBackoff) * head.lensSpanCm;
      this.face.position.set(0, 0, -backoff);
      // The arms rest against the temples, so a mesh as wide as the temples
      // would swallow them. The face is held inside the gap between this
      // frame's own arms (measured from its geometry), falling back to a
      // fraction of the frame width when that can't be measured — only ever
      // narrowed, never widened.
      const measured = arms ? this.armFit(head, arms, backoff) : null;
      const target = MathUtils.clamp(
        Math.min(1, measured ?? (frameWidthCm * HEAD_OCCLUDER.frameClearance) / Math.max(w, 1e-3)),
        HEAD_OCCLUDER.minFit,
        1
      );
      this.fit = this.haveFit ? this.fit + (target - this.fit) * HEAD_OCCLUDER.fitFollow : target;
      this.haveFit = true;
      this.face.scale.set(this.tune?.inset ?? this.fit, 1, 1);
    }
    this.face.visible = mesh && this.haveMesh && (this.parts === "both" || this.parts === "face");
    this.cranium.visible = this.parts === "both" || this.parts === "cranium";

    // Cranium: an ellipsoid whose equator is the ear plane, of which only the
    // half behind the ears is kept (below). Sized from the measured head, and
    // never wider than the frame the arms hang from.
    const height = head.faceHeightCm;
    const lowY = head.pupilY - HEAD_OCCLUDER.craniumBelowPupils * height;
    const highY = head.foreheadY + HEAD_OCCLUDER.craniumAboveForehead * (head.foreheadY - head.pupilY);
    const clipZ = head.earZ - HEAD_OCCLUDER.earPlaneBackoff * height;
    // Widest at the clip plane (its equator), so that is where it must fit between the arms.
    const armGap = arms ? armHalfWidthAt(arms.profile, (clipZ - head.anchorOffset.z) / arms.scale) * arms.scale : NaN;
    const halfWidth = Math.min(
      HEAD_OCCLUDER.craniumHalfWidth * w,
      armGap > 0 ? armGap * HEAD_OCCLUDER.armClearance : 0.5 * frameWidthCm * HEAD_OCCLUDER.frameClearance
    );
    this.cranium.scale.set(halfWidth, (highY - lowY) / 2, HEAD_OCCLUDER.craniumBehindEars * height);
    this.cranium.position.set(0, (highY + lowY) / 2, clipZ);

    // The cut: keep only the part of the cranium behind the ear plane (the
    // face mesh covers what is in front). Three.js clips fragments whose
    // signed distance to the plane is NEGATIVE, i.e. it keeps the side the
    // normal points to — so the normal points backward (head -Z). Getting
    // this backwards keeps a cap over the face and discards the skull, which
    // looks like "no occlusion at all"; `?tryOnDebug=2` tints the occluder so
    // it can be checked by eye. Clipping planes are world-space, so the
    // plane is rebuilt from the head's current pose every frame.
    this.tmpNormal.set(0, 0, -1).applyQuaternion(head.quaternion);
    this.tmpPoint.set(0, 0, clipZ).applyQuaternion(head.quaternion).add(head.origin);
    this.clip.setFromNormalAndCoplanarPoint(this.tmpNormal, this.tmpPoint);
  }
}
