import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  Vector3,
} from "three";
import type { LensConfiguration } from "@/data/products";

/**
 * Finds, removes and replaces the lens surfaces of a generated frame model.
 *
 * A Hyper3D/Rodin export is one mesh with one material — there is no "lens"
 * object to hide and no lens material to make transparent without also making
 * the frame transparent (checked on every model in this project: one node,
 * one primitive, one material named "model"). So the lens has to be found in
 * the geometry itself, face by face.
 *
 * A face is lens if it sits inside one of the two lens openings, faces the
 * viewer (front surface) or away (back surface — generated lenses are thin
 * solids), and lies at lens depth rather than out on the rim's front. Each
 * test on its own is weak; together they are decisive, and the ellipse is set
 * just *inside* a typical lens, so at worst a hair of lens is left at the
 * rim's edge — invisible under it — and the rim itself can never be taken.
 *
 * Deliberately not a region-grow: generated surfaces are bumpy, and growing
 * face-to-face across them breaks into islands wherever a normal wobbles.
 *
 * The same classification drives all three lens modes: `none` drops every
 * lens face; `original` and `clear` drop them from the frame and rebuild the
 * *front* surface as its own mesh with our material — so the replacement is
 * the generator's exact lens shape, not a generic disc, and the frame's own
 * geometry, origin, scale and transforms are untouched.
 */

/** Same assumption the loader makes: lens centres at 45% of the total width. */
const LENS_SPAN_FRACTION = 0.45;
/** Depth slice, from the front, the lenses live in. */
const FRONT_SLICE = 0.15;
/** |normal·Z| a face needs to count as a lens surface (front or back). */
const FACING = 0.5;
/**
 * The lens region, in lens-span units. A real lens isn't centred on its
 * optical centre — it reaches further out toward the temple than in toward
 * the nose — so the ellipse is nudged outward to cover that flare without
 * reaching the bridge.
 */
const LENS_RX = 0.5;
const LENS_RY = 0.38;
const LENS_OUTWARD_SHIFT = 0.06;
/**
 * Depth window around the front lens surface, as fractions of width. Reaches
 * back far enough to take the lens's rear surface; forward only a little, so
 * the rim's front — which stands proud of the lens — is left alone.
 */
const DEPTH_BEHIND = 0.06;
const DEPTH_AHEAD = 0.02;

/** Below this the analysis is reported but the model is left exactly as loaded. */
export const LENS_GEOMETRY_TRUSTED = 0.5;

/** Opacity limits for a drawn lens: never invisible, never hiding the eyes. */
const MIN_LENS_OPACITY = 0.04;
const MAX_LENS_OPACITY = 0.4;
const CLEAR_LENS_OPACITY = 0.06;
const DEFAULT_TINT_STRENGTH = 0.15;

export interface LensAnalysis {
  /** Whether any lens surface was found at all. */
  found: boolean;
  /** 0..1 — how sure the classification is that what it found is the lens and only the lens. */
  confidence: number;
  /** Plain-language grounds for the score, most important first. */
  reasons: string[];
  totalFaces: number;
  lensFaces: number;
  /** Lens faces facing the viewer — the surface a replacement lens is built from. */
  frontFaces: number;
  backFaces: number;
  /** Front lens faces on each side of the bridge. */
  left: number;
  right: number;
  /** Projected area of the front lens faces over the area of the two lens ellipses. */
  coverage: number;
  /** Depth scatter of the front faces, as a fraction of the model's width. */
  depthSpread: number;
}

interface MeshClassification {
  mesh: Mesh;
  keep: number[];
  front: number[];
  back: number[];
}

export interface Classification {
  meshes: MeshClassification[];
  analysis: LensAnalysis;
}

/**
 * Walks every face of `root` and works out which ones are the generator's
 * baked-in lens. This is the expensive part of the whole lens pass — O(faces)
 * trig per face across the *entire* model, tens of milliseconds on a typical
 * generated frame (see `LensProcessingResult.durationMs`) — and it depends
 * only on geometry, never on the chosen lens mode or colour. Exported so a
 * caller that needs to apply several different lens configs to the same
 * source model (the admin's three-mode preview; a colour slider being
 * dragged) can classify once and reuse the result via `applyLensConfigCached`
 * instead of paying this cost again for every config.
 */
export function classify(root: Object3D): Classification {
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const meshes: MeshClassification[] = [];
  const analysis: LensAnalysis = {
    found: false,
    confidence: 0,
    reasons: [],
    totalFaces: 0,
    lensFaces: 0,
    frontFaces: 0,
    backFaces: 0,
    left: 0,
    right: 0,
    coverage: 0,
    depthSpread: 0,
  };
  if (!(size.x > 0)) {
    analysis.reasons.push("The model has no measurable width.");
    return { meshes, analysis };
  }

  const centreX = (box.min.x + box.max.x) / 2;
  const lensSpan = size.x * LENS_SPAN_FRACTION;
  const rx = lensSpan * LENS_RX;
  const ry = lensSpan * LENS_RY;
  const frontCut = box.max.z - size.z * FRONT_SLICE;

  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();

  let projectedArea = 0;
  let depthSum = 0;
  let depthSquares = 0;

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const index = geometry.index;
    const faceCount = index ? index.count / 3 : position.count / 3;
    analysis.totalFaces += faceCount;
    const vertexOf = (f: number, k: number) => (index ? index.getX(f * 3 + k) : f * 3 + k);

    mesh.updateWorldMatrix(true, false);
    const cx = new Float32Array(faceCount);
    const cy = new Float32Array(faceCount);
    const cz = new Float32Array(faceCount);
    const nz = new Float32Array(faceCount);
    const area = new Float32Array(faceCount);
    for (let f = 0; f < faceCount; f++) {
      a.fromBufferAttribute(position, vertexOf(f, 0)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, vertexOf(f, 1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, vertexOf(f, 2)).applyMatrix4(mesh.matrixWorld);
      cx[f] = (a.x + b.x + c.x) / 3;
      cy[f] = (a.y + b.y + c.y) / 3;
      cz[f] = (a.z + b.z + c.z) / 3;
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      ab.cross(ac);
      const len = ab.length();
      nz[f] = len > 0 ? ab.z / len : 0;
      // The face's footprint seen from the front — what fills the lens opening.
      area[f] = Math.abs(ab.z) / 2;
    }

    // Lens height, and the depth of the front lens surface: taken from the
    // forward-facing faces in the two lens columns of the front slice.
    let ySum = 0;
    let zSum = 0;
    let count = 0;
    for (let f = 0; f < faceCount; f++) {
      if (cz[f] < frontCut || nz[f] < FACING) continue;
      if (Math.abs(Math.abs(cx[f] - centreX) - lensSpan / 2) > size.x * 0.04) continue;
      ySum += cy[f];
      zSum += cz[f];
      count++;
    }
    if (count < 20) {
      meshes.push({ mesh, keep: [], front: [], back: [] });
      return;
    }
    const lensY = ySum / count;
    const lensZ = zSum / count;
    const zMin = lensZ - size.x * DEPTH_BEHIND;
    const zMax = lensZ + size.x * DEPTH_AHEAD;

    const keep: number[] = [];
    const front: number[] = [];
    const back: number[] = [];
    for (let f = 0; f < faceCount; f++) {
      let side = 0;
      if (Math.abs(nz[f]) >= FACING && cz[f] >= zMin && cz[f] <= zMax) {
        for (const sign of [-1, 1]) {
          const ellipseX = centreX + sign * (lensSpan / 2 + lensSpan * LENS_OUTWARD_SHIFT);
          const dx = (cx[f] - ellipseX) / rx;
          const dy = (cy[f] - lensY) / ry;
          if (dx * dx + dy * dy <= 1) {
            side = sign;
            break;
          }
        }
      }
      const v = [vertexOf(f, 0), vertexOf(f, 1), vertexOf(f, 2)];
      if (side === 0) {
        keep.push(...v);
        continue;
      }
      if (nz[f] > 0) {
        front.push(...v);
        projectedArea += area[f];
        depthSum += cz[f];
        depthSquares += cz[f] * cz[f];
        if (side < 0) analysis.left++;
        else analysis.right++;
      } else {
        back.push(...v);
      }
    }
    meshes.push({ mesh, keep, front, back });
  });

  analysis.frontFaces = analysis.left + analysis.right;
  analysis.backFaces = meshes.reduce((n, m) => n + m.back.length / 3, 0);
  analysis.lensFaces = analysis.frontFaces + analysis.backFaces;
  analysis.found = analysis.lensFaces > 0;
  if (!analysis.found) {
    analysis.reasons.push("No faces inside the lens openings at lens depth — the rims are already open, or the model isn't facing +Z.");
    return { meshes, analysis };
  }

  analysis.coverage = projectedArea / (2 * Math.PI * rx * ry);
  const n = analysis.frontFaces;
  const mean = n > 0 ? depthSum / n : 0;
  analysis.depthSpread = n > 0 ? Math.sqrt(Math.max(0, depthSquares / n - mean * mean)) / size.x : 0;

  // Each check scales the score; the reasons say which ones bit.
  let confidence = 1;
  const symmetry = Math.min(analysis.left, analysis.right) / Math.max(analysis.left, analysis.right, 1);
  if (symmetry >= 0.5) {
    analysis.reasons.push(`Symmetric: ${analysis.left} front faces on the left lens, ${analysis.right} on the right.`);
  } else {
    confidence *= 0.5;
    analysis.reasons.push(`Lopsided: ${analysis.left} front faces on the left lens vs ${analysis.right} on the right.`);
  }
  if (analysis.frontFaces < 30) {
    confidence *= 0.5;
    analysis.reasons.push(`Only ${analysis.frontFaces} front-facing lens faces — too few to be a lens surface.`);
  }
  if (analysis.coverage < 0.25) {
    confidence *= 0.5;
    analysis.reasons.push(`Lens faces fill only ${Math.round(analysis.coverage * 100)}% of the lens openings — likely open rims with stray geometry.`);
  } else if (analysis.coverage > 1.6) {
    confidence *= 0.6;
    analysis.reasons.push(`Lens faces fill ${Math.round(analysis.coverage * 100)}% of the lens openings — more than a lens; may include rim.`);
  } else {
    analysis.reasons.push(`Lens faces fill ${Math.round(analysis.coverage * 100)}% of the lens openings.`);
  }
  if (analysis.depthSpread > 0.03) {
    confidence *= 0.7;
    analysis.reasons.push(`Front lens faces are not flat (depth spread ${(analysis.depthSpread * 100).toFixed(1)}% of width).`);
  } else {
    analysis.reasons.push(`Front lens faces form a thin, flat sheet (depth spread ${(analysis.depthSpread * 100).toFixed(1)}% of width).`);
  }
  const fraction = analysis.lensFaces / Math.max(1, analysis.totalFaces);
  if (fraction > 0.5) {
    confidence *= 0.4;
    analysis.reasons.push(`${Math.round(fraction * 100)}% of the whole model was classified as lens — implausible.`);
  }
  analysis.confidence = Math.round(confidence * 100) / 100;
  return { meshes, analysis };
}

/** Classifies the lens faces of a model without changing it. */
export function analyzeLenses(root: Object3D): LensAnalysis {
  return classify(root).analysis;
}

function clampOpacity(value: number | undefined, fallback: number): number {
  const v = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_LENS_OPACITY, Math.max(MIN_LENS_OPACITY, v));
}

/**
 * The material a replacement lens is drawn with.
 *
 * The transparent overlay canvas here is a separate DOM layer sitting *over*
 * the camera's `<video>` element (see `GlassesOverlay3D`/`TryOnScene`) — the
 * browser composites the two with ordinary alpha-over, not WebGL. That rules
 * out multiplicative/"overlay" blend modes for the tint itself: they only
 * see whatever else has already been drawn *inside this WebGL scene* (the
 * frame, mainly — nothing, everywhere else), never the video underneath, so
 * multiplying against it would darken the lens toward black instead of
 * tinting the face. Alpha blending is the one blend mode whose output — a
 * semi-transparent tinted pixel — the browser's own compositor then correctly
 * lays over the live video for us; `opacity` (from `tintStrength`) is what
 * that alpha is.
 *
 * What alpha blending on its own doesn't give is the look of glass rather
 * than tinted plastic: a single flat colour reads as a decal. `clearcoat`
 * adds a second, sharper specular layer on top of the base one — a crisp
 * highlight distinct from the diffuse tint, exactly what catches the eye on
 * real lens glass. It is a pure BRDF term costing one extra light
 * evaluation, not `transmission` (real refraction), which would need the
 * renderer to capture the scene behind the lens into an offscreen target
 * every frame — real per-frame cost in the live camera try-on, and for
 * nothing: what a customer's lens is actually "held up in front of" is that
 * same off-limits video layer.
 */
export function createLensMaterial(config: LensConfiguration): MeshPhysicalMaterial {
  const clear = config.mode === "clear";
  return new MeshPhysicalMaterial({
    color: new Color(clear ? "#ffffff" : config.color || "#ffffff"),
    transparent: true,
    opacity: clear ? CLEAR_LENS_OPACITY : clampOpacity(config.tintStrength, DEFAULT_TINT_STRENGTH),
    roughness: clear ? 0.05 : 0.08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: clear ? 0.9 : 1.1,
    // No depth write: the lens is a single thin sheet drawn after the frame,
    // and writing depth would let it punch the far rim and arms out of view
    // wherever they sit behind it.
    depthWrite: false,
    // Normals on generated surfaces wobble, and a lens seen at a yaw is still
    // a lens — culling by winding would leave holes at the edges.
    side: DoubleSide,
  });
}

/** Builds a compact geometry holding just the listed faces of `source`. */
function extractFaces(source: BufferGeometry, faceIndices: number[]): BufferGeometry {
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const remap = new Map<number, number>();
  const index: number[] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  for (const v of faceIndices) {
    let mapped = remap.get(v);
    if (mapped === undefined) {
      mapped = remap.size;
      remap.set(v, mapped);
      positions.push(position.getX(v), position.getY(v), position.getZ(v));
      if (normal) normals.push(normal.getX(v), normal.getY(v), normal.getZ(v));
    }
    index.push(mapped);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  if (normal) geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  geometry.setIndex(index);
  return geometry;
}

export interface LensProcessingResult {
  analysis: LensAnalysis;
  /** Whether the model was changed at all. */
  applied: boolean;
  removedFaces: number;
  /** The replacement lens meshes (empty for mode `none`, or when nothing was applied). */
  lensMeshes: Mesh[];
  /** Wall time of the whole pass, classification included. */
  durationMs: number;
}

/**
 * Applies a lens configuration to a loaded model, in place: the generator's
 * lens faces are taken out of the frame, and for `original`/`clear` the front
 * surface comes back as its own mesh — child of the frame mesh, so it shares
 * its transform exactly — with our material.
 *
 * Nothing is changed unless the classification is confident it found the
 * lens (`LENS_GEOMETRY_TRUSTED`): an unusual model is left exactly as loaded
 * rather than having unknown geometry cut out of it. `force` overrides that
 * for an admin who has looked at the result and wants it anyway.
 *
 * Classifies `root` itself — the expensive step. A caller applying several
 * configs to the same source model (comparing modes; a colour slider being
 * dragged) should classify once and call `applyLensConfigCached` instead.
 */
export function applyLensConfig(
  root: Object3D,
  config: LensConfiguration,
  options: { force?: boolean } = {}
): LensProcessingResult {
  return applyLensConfigCached(root, classify(root), config, options);
}

/**
 * Same as `applyLensConfig`, given a classification already computed for a
 * model with the same mesh structure — typically `targetRoot` itself
 * (reapplying a different config to the same object isn't meaningful, since
 * the first application already stripped its geometry) or a geometry-only
 * clone of the model that classification came from (see
 * `renderModelThumbnail`'s per-model cache). Re-associates the cached
 * per-mesh face lists with `targetRoot`'s own meshes by traversal order,
 * which `classify` and every caller here use consistently.
 */
export function applyLensConfigCached(
  targetRoot: Object3D,
  classification: Classification,
  config: LensConfiguration,
  options: { force?: boolean } = {}
): LensProcessingResult {
  const started = performance.now();
  const { analysis } = classification;
  const result: LensProcessingResult = { analysis, applied: false, removedFaces: 0, lensMeshes: [], durationMs: 0 };
  const finish = () => {
    result.durationMs = Math.round((performance.now() - started) * 10) / 10;
    return result;
  };
  if (!analysis.found) return finish();
  if (analysis.confidence < LENS_GEOMETRY_TRUSTED && !options.force) return finish();

  const targetMeshes: Mesh[] = [];
  targetRoot.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) targetMeshes.push(mesh);
  });

  const material = config.mode === "none" ? null : createLensMaterial(config);
  classification.meshes.forEach(({ keep, front, back }, i) => {
    const mesh = targetMeshes[i];
    if (!mesh) return;
    const dropped = (front.length + back.length) / 3;
    if (dropped === 0) return;
    const geometry = mesh.geometry;
    if (material && front.length > 0) {
      const lens = new Mesh(extractFaces(geometry, front), material);
      lens.name = "lens";
      // After the frame, so the tint blends over the rim rather than the rim
      // being drawn over a lens that already wrote nothing to depth.
      lens.renderOrder = 1;
      mesh.add(lens);
      result.lensMeshes.push(lens);
    }
    geometry.setIndex(new BufferAttribute(Uint32Array.from(keep), 1));
    result.removedFaces += dropped;
  });
  result.applied = result.removedFaces > 0;
  return finish();
}
