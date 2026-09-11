import { Box3, Group, Mesh, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildProceduralFrame } from "@/lib/threeTryOn/proceduralFrame";
import type { TryOnConfig } from "@/data/products";

/**
 * A glasses model ready to be placed on a face. Its root is already shifted so
 * that the origin sits on the **lens-centre line** — midway between the
 * lenses, at their vertical centre, on the front lens plane — because that is
 * the point the face pose anchors (the bridge of the nose, between the eyes).
 */
export interface GlassesModel {
  root: Object3D;
  /** Distance between the two lens centres, in the model's own units. */
  lensSpan: number;
  /** Bounding-box extents, in the model's own units. */
  width: number;
  height: number;
  dispose(): void;
}

/**
 * Where a GLB's lens centres sit, as a fraction of its total width. Real
 * frames are remarkably consistent here — a 140mm-wide frame has its optical
 * centres about 63mm apart — so this is a safe default for a model whose
 * internals we can't inspect. Per-product `scale` corrects the rest.
 */
const GLB_LENS_SPAN_FRACTION = 0.45;

/**
 * Re-parents `object` into a group offset so `anchor` (in the object's own
 * coordinates) ends up at the group's origin.
 */
function anchorAtOrigin(object: Object3D, anchor: Vector3): Group {
  const root = new Group();
  object.position.sub(anchor);
  root.add(object);
  return root;
}

function disposeTree(object: Object3D) {
  object.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

function measure(object: Object3D): { box: Box3; size: Vector3 } {
  const box = new Box3().setFromObject(object);
  return { box, size: box.getSize(new Vector3()) };
}

/**
 * The placeholder frame used when a product has no GLB. Built in lens-span
 * units with its lens centres already 1 unit apart and centred on the origin,
 * so it needs no bounding-box guesswork.
 */
export function buildFallbackModel(tryOn: TryOnConfig): GlassesModel {
  const frame = buildProceduralFrame(tryOn);
  const { size } = measure(frame);
  const root = new Group();
  root.add(frame);
  return {
    root,
    lensSpan: 1,
    width: size.x,
    height: size.y,
    dispose: () => disposeTree(root),
  };
}

const modelCache = new Map<string, Promise<GlassesModel>>();

async function loadFromUrl(url: string): Promise<GlassesModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;

  const { box, size } = measure(scene);
  if (!(size.x > 0) || !Number.isFinite(size.x)) {
    disposeTree(scene);
    throw new Error("The 3D model has no measurable geometry.");
  }

  // Convention for an uploaded GLB: modelled facing +Z with the temple arms
  // running back along -Z, so its front face (max Z) is the lens plane and its
  // horizontal/vertical centre is the lens-centre line.
  const centre = box.getCenter(new Vector3());
  const root = anchorAtOrigin(scene, new Vector3(centre.x, centre.y, box.max.z));

  return {
    root,
    lensSpan: size.x * GLB_LENS_SPAN_FRACTION,
    width: size.x,
    height: size.y,
    dispose: () => disposeTree(root),
  };
}

/**
 * Loads a GLB/GLTF frame, caching per URL — switching between products in the
 * try-on carousel and back shouldn't re-download and re-parse the same model.
 *
 * Cached models are shared, so callers must not mutate the returned root's
 * transform; put it inside a group of your own (see `TryOnScene.setModel`).
 */
export function loadGlassesModel(url: string): Promise<GlassesModel> {
  const cached = modelCache.get(url);
  if (cached) return cached;

  const pending = loadFromUrl(url);
  modelCache.set(url, pending);
  pending.catch(() => modelCache.delete(url));
  return pending;
}

/**
 * Uniform scale that makes the model's lens centres land exactly on the face's
 * measured lens-centre span — the "automatic scale from facial landmarks"
 * step. `targetLensSpan` comes from the live landmark measurements, so this is
 * recomputed every frame and tracks the user moving closer or further away.
 */
export function fitScale(model: GlassesModel, targetLensSpan: number): number {
  if (!(model.lensSpan > 0)) return 1;
  return targetLensSpan / model.lensSpan;
}
