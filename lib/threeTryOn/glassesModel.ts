import { Box3, Group, MathUtils, Mesh, Object3D, Vector3 } from "three";
import { gltfLoader } from "@/lib/threeTryOn/gltfLoader";
import { buildProceduralFrame } from "@/lib/threeTryOn/proceduralFrame";
import { applyLensConfig, type LensProcessingResult } from "@/lib/threeTryOn/lensGeometry";
import {
  resolveLensConfig,
  type LensConfiguration,
  type ModelCalibration,
  type TryOnConfig,
} from "@/data/products";

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
  /** What the lens pass found and did. Absent for the procedural placeholder. */
  lens?: LensProcessingResult;
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

/** Depth slice, from the front, treated as "the front of the frame". */
const FRONT_SLICE = 0.12;
/** Half-width of the column sampled around each lens centre. */
const LENS_COLUMN = 0.04;
/** Below this many sampled vertices the measurement isn't trustworthy. */
const MIN_LENS_SAMPLES = 50;

/**
 * Height of the lens-centre line, measured from the model's own geometry.
 *
 * This has to be the *optical centre*, because that is the point placed on
 * the wearer's pupils. The bounding box's vertical middle is not it: a frame
 * with a heavy brow bar, or arms that drop behind the ear, shifts the box
 * without moving the lenses, and anchoring on the box then lifts the frame
 * onto the forehead or drops it onto the cheeks.
 *
 * Measured by sampling the two columns of front-facing geometry where the
 * lenses sit and averaging their height — on a real frame those columns are
 * almost entirely lens surface and rim, centred on the optical axis.
 */
function measureLensHeight(object: Object3D, box: Box3, size: Vector3, lensSpanFraction: number): number {
  const frontCut = box.max.z - size.z * FRONT_SLICE;
  const centreX = (box.min.x + box.max.x) / 2;
  const lensOffsetX = size.x * (lensSpanFraction / 2);
  const tolerance = size.x * LENS_COLUMN;

  const vertex = new Vector3();
  let sum = 0;
  let count = 0;

  object.updateWorldMatrix(true, true);
  object.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry?.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (vertex.z < frontCut) continue;
      const dx = Math.abs(Math.abs(vertex.x - centreX) - lensOffsetX);
      if (dx > tolerance) continue;
      sum += vertex.y;
      count++;
    }
  });

  return count >= MIN_LENS_SAMPLES ? sum / count : (box.min.y + box.max.y) / 2;
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

export interface LoadOptions {
  /** How the model's baked-in lens is handled. Omitted: the model is shown as exported. */
  lens?: LensConfiguration;
  /** Apply the lens pass even when the classification isn't confident. */
  forceLens?: boolean;
  /** Per-model corrections, applied before anything is measured. */
  calibration?: ModelCalibration;
}

/** The load options a product's try-on settings call for. */
export function lensLoadOptions(
  tryOn: Pick<TryOnConfig, "lens" | "hideLenses" | "lensColor" | "lensOpacity" | "model3dCalibration">
): LoadOptions {
  return { lens: resolveLensConfig(tryOn), calibration: tryOn.model3dCalibration };
}

/**
 * Brings a model into the convention (facing +Z, arms back along -Z) when
 * its export didn't quite: a rotation and a translation (as fractions of the
 * model's width, so the numbers mean the same on a model in metres and one in
 * millimetres) baked into a wrapper group. Done here, once per load, so every
 * measurement below sees the corrected model.
 */
export function applyCalibration(scene: Object3D, calibration: ModelCalibration | undefined): Object3D {
  const rotation = calibration?.rotationDeg;
  const translation = calibration?.translation;
  if (!rotation && !translation) return scene;
  const wrapper = new Group();
  wrapper.add(scene);
  if (rotation) {
    scene.rotation.set(
      MathUtils.DEG2RAD * rotation[0],
      MathUtils.DEG2RAD * rotation[1],
      MathUtils.DEG2RAD * rotation[2]
    );
  }
  if (translation) {
    const width = measure(scene).size.x;
    scene.position.set(translation[0] * width, translation[1] * width, translation[2] * width);
  }
  return wrapper;
}

async function loadFromUrl(url: string, options: LoadOptions): Promise<GlassesModel> {
  const gltf = await gltfLoader().loadAsync(url);
  const scene = applyCalibration(gltf.scene, options.calibration);
  const lensSpanFraction = options.calibration?.lensSpanFraction ?? GLB_LENS_SPAN_FRACTION;

  const { box, size } = measure(scene);
  if (!(size.x > 0) || !Number.isFinite(size.x)) {
    disposeTree(scene);
    throw new Error("The 3D model has no measurable geometry.");
  }

  // Convention for an uploaded GLB: modelled facing +Z with the temple arms
  // running back along -Z, so its front face (max Z) is the lens plane.
  // Horizontally the frame is symmetric, so the box's centre is the bridge;
  // vertically the lens line has to be measured, not assumed.
  //
  // Measured before the lens pass, so what the pass adds or removes can never
  // move the anchor: a model sits on the face identically in every lens mode.
  const anchor = new Vector3(
    box.getCenter(new Vector3()).x,
    measureLensHeight(scene, box, size, lensSpanFraction),
    box.max.z
  );

  // Before anchoring: the lens surfaces are found relative to the model's
  // own bounding box, which anchoring shifts. Once per load, never per frame
  // — the result is cached with the model.
  const lens = options.lens ? applyLensConfig(scene, options.lens, { force: options.forceLens }) : undefined;

  const root = anchorAtOrigin(scene, anchor);

  return {
    root,
    lensSpan: size.x * lensSpanFraction,
    width: size.x,
    height: size.y,
    lens,
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
export function loadGlassesModel(url: string, options: LoadOptions = {}): Promise<GlassesModel> {
  const key = cacheKey(url, options);
  const cached = modelCache.get(key);
  if (cached) return cached;

  const pending = loadFromUrl(url, options);
  modelCache.set(key, pending);
  pending.then(
    () => settled.add(key),
    () => {
      modelCache.delete(key);
      failed.add(key);
    }
  );
  return pending;
}

/**
 * The lens pass edits the geometry, so each distinct lens setting is its own
 * entry — keyed only on what changes the result, so two products sharing a
 * model and a setting share one parsed copy.
 */
function cacheKey(url: string, options: LoadOptions): string {
  const lens = options.lens;
  const c = options.calibration;
  const calibration = c ? `#cal=${(c.rotationDeg ?? []).join(",")}|${(c.translation ?? []).join(",")}|${c.lensSpanFraction ?? ""}` : "";
  if (!lens) return `${url}#lens=raw${calibration}`;
  const tint = lens.mode === "original" ? `:${lens.color ?? ""}:${lens.tintStrength ?? ""}` : "";
  return `${url}#lens=${lens.mode}${tint}${options.forceLens ? ":force" : ""}${calibration}`;
}

/** Keys whose load has finished — the models that can be shown with no wait. */
const settled = new Set<string>();
/**
 * Keys whose load failed. A real load still retries (the file may have been
 * added since), but a preload doesn't: re-requesting a missing model every
 * time the selection moves would be pure noise.
 */
const failed = new Set<string>();

/** True once a model is in memory and can be shown without any wait. */
export function isGlassesModelReady(url: string, options: LoadOptions = {}): boolean {
  return settled.has(cacheKey(url, options));
}

/**
 * Warms the cache for a model the user is likely to pick next, so the switch
 * is instant when they do. Same cache as `loadGlassesModel`, so nothing is
 * ever downloaded or parsed twice; a failure is swallowed here and simply
 * surfaces later, from the real load, if the user does pick that frame.
 */
export function preloadGlassesModel(url: string, options: LoadOptions = {}): Promise<void> {
  if (failed.has(cacheKey(url, options))) return Promise.resolve();
  return loadGlassesModel(url, options).then(
    () => {},
    () => {}
  );
}

/**
 * Preloads the frames around the selected one — nearest first, one at a
 * time — so the two the user is most likely to tap next are ready without
 * the whole catalogue being pulled down.
 *
 *   selected  →  +1, −1  →  +2, −2
 *
 * Sequential rather than parallel, so a preload never competes with the
 * selected frame's own download for bandwidth: it only starts once that one
 * has finished. Honours the browser's data-saver setting by doing nothing.
 * Returns a cancel function; call it when the selection changes so the queue
 * re-centres on the new frame instead of finishing the old order.
 */
export function preloadGlassesModelsAround(
  models: ReadonlyArray<{ url: string; options?: LoadOptions } | null>,
  index: number,
  radius = 2
): () => void {
  let cancelled = false;
  const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData || index < 0 || models.length < 2) return () => {};

  // Carousel positions, nearest first. A position with no 3D model (drawn
  // procedurally) needs nothing and is skipped.
  const order: number[] = [];
  for (let d = 1; d <= radius; d++) {
    if (index + d < models.length && models[index + d]) order.push(index + d);
    if (index - d >= 0 && models[index - d]) order.push(index - d);
  }

  const run = async () => {
    // The selected frame first: it is already loading (or loaded), this
    // just waits for it so the neighbours queue behind it.
    const current = models[index];
    if (current) await loadGlassesModel(current.url, current.options).catch(() => {});
    for (const i of order) {
      if (cancelled) return;
      const next = models[i]!;
      await preloadGlassesModel(next.url, next.options);
    }
  };
  void run();

  return () => {
    cancelled = true;
  };
}
