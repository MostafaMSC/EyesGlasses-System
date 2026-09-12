import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Mesh,
  Object3D,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Renders a flat, front-on picture of a 3D frame, for use as the product's
 * catalogue image.
 *
 * A product whose only asset is a `.glb` has nothing 2D to show: the cards,
 * the admin preview and the 2D try-on all fall back to the generated
 * placeholder artwork, so the shop displays a generic frame for a product
 * that actually has a real model. This renders the model once and gives them
 * something true to show.
 *
 * The render doubles as a 2D try-on overlay: it reports where the lens
 * centres landed, which is exactly the `overlayGeometry` the flat path needs
 * to put them on the eyes.
 */

/** Width of the finished picture, in pixels. */
const WIDTH = 1000;
/** Width of the throwaway renders used to measure the model. */
const PROBE_WIDTH = 320;
/** Same assumption the loader makes: lens centres at 45% of the total width. */
const LENS_SPAN_FRACTION = 0.45;
/** Half-width of the pixel band sampled to locate the lens line. */
const LENS_BAND_FRACTION = 0.03;
/** Breathing room around the frame, as a fraction of its size. */
const PADDING = 0.06;
/** Below this the pixel is antialiasing fringe, not frame. */
const ALPHA_FLOOR = 12;

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)] as const;

/** Which pixels of a render were drawn on, as a 1-byte-per-pixel mask. */
interface Mask {
  width: number;
  height: number;
  drawn: Uint8Array;
  /** The render itself, on a 2D canvas, ready to be exported as a PNG. */
  image: HTMLCanvasElement;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Reads back which pixels a render actually drew on.
 *
 * Everything downstream — the framing, the lens line, which way round the
 * model is — is measured from this rather than from the geometry, because the
 * geometry lies: these models carry meshes that inflate the bounding box and
 * the vertex averages while drawing nothing at all.
 */
function readMask(canvas: HTMLCanvasElement): Mask {
  // A WebGL canvas has no 2D context, so copy it into one to read pixels.
  const scratch = document.createElement("canvas");
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const ctx = scratch.getContext("2d");
  if (!ctx) throw new Error("Could not read the render.");
  ctx.drawImage(canvas, 0, 0);

  const { data } = ctx.getImageData(0, 0, scratch.width, scratch.height);
  const drawn = new Uint8Array(scratch.width * scratch.height);
  for (let i = 0; i < drawn.length; i++) drawn[i] = data[i * 4 + 3] > ALPHA_FLOOR ? 1 : 0;
  return { width: scratch.width, height: scratch.height, drawn, image: scratch };
}

function maskBounds(mask: Mask): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!mask.drawn[y * mask.width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Whether the silhouette runs off the render — i.e. the framing cut it. */
function touchesEdge(bounds: Bounds, mask: Mask): boolean {
  return (
    bounds.minX === 0 || bounds.minY === 0 || bounds.maxX === mask.width - 1 || bounds.maxY === mask.height - 1
  );
}

/**
 * How well the silhouette matches its own left-right mirror image, 0 to 1.
 *
 * This is what tells a front view from a side view. A pair of glasses seen
 * head-on is very nearly symmetric about its own centre line; seen from the
 * side it is not symmetric at all, being all lens at one end and all temple
 * arm at the other.
 */
function mirrorScore(mask: Mask, bounds: Bounds): number {
  let both = 0;
  let either = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const here = mask.drawn[y * mask.width + x];
      const mirrored = mask.drawn[y * mask.width + (bounds.minX + bounds.maxX - x)];
      if (here && mirrored) both++;
      if (here || mirrored) either++;
    }
  }
  return either > 0 ? both / either : 0;
}

/** Vertical extent of the silhouette in each column of `bounds`, in pixels. */
function columnHeights(mask: Mask, bounds: Bounds): number[] {
  const heights: number[] = [];
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    let top = Infinity;
    let bottom = -Infinity;
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      if (!mask.drawn[y * mask.width + x]) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    heights.push(Number.isFinite(top) ? bottom - top + 1 : 0);
  }
  return heights;
}

/** Mean row of the drawn pixels in a horizontal slice of the silhouette. */
function meanRow(mask: Mask, bounds: Bounds, fromX: number, toX: number): number | null {
  let sum = 0;
  let count = 0;
  for (let x = fromX; x <= toX; x++) {
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      if (!mask.drawn[y * mask.width + x]) continue;
      sum += y;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * Vertical centre of the drawn frame at one lens, in pixels.
 *
 * Read off the render rather than computed from the mesh: the optical centre
 * is what sits on the wearer's pupil, and it is the midpoint of the lens as
 * actually drawn. Sampled over a band of columns so a gap between the rim and
 * a bridge detail can't throw it off.
 */
function lensLineY(mask: Mask, centreX: number, halfBand: number): number | null {
  const from = Math.max(0, Math.round(centreX - halfBand));
  const to = Math.min(mask.width - 1, Math.round(centreX + halfBand));
  let minY = Infinity;
  let maxY = -Infinity;
  for (let x = from; x <= to; x++) {
    for (let y = 0; y < mask.height; y++) {
      if (!mask.drawn[y * mask.width + x]) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minY) ? (minY + maxY) / 2 : null;
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

/** An axis-aligned point of view: the camera sits along `forward`, `up` up. */
interface View {
  forward: Vector3;
  up: Vector3;
}

/** One measuring render: what came out, and how big a pixel of it is. */
interface Probe {
  view: View;
  mask: Mask;
  bounds: Bounds;
  unitsPerPx: number;
}

/** Which of the three axes an axis-aligned direction points along. */
function axisIndex(direction: Vector3): number {
  if (Math.abs(direction.x) > 0.5) return 0;
  return Math.abs(direction.y) > 0.5 ? 1 : 2;
}

/** The convention an uploaded GLB is supposed to follow: facing +Z, Y up. */
const CONVENTIONAL_VIEW: View = { forward: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) };

/**
 * One view down each axis, enough between them to measure the model's drawn
 * size along all three.
 */
const AXIS_PROBES: View[] = [
  { forward: AXES[0].clone(), up: AXES[1].clone() },
  { forward: AXES[1].clone(), up: AXES[2].clone() },
  { forward: AXES[2].clone(), up: AXES[1].clone() },
];

/** Extent of a box along an arbitrary (unit) direction, and its centre there. */
function spanAlong(box: Box3, direction: Vector3): { min: number; max: number; centre: number } {
  const corner = new Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    const d = corner.dot(direction);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max, centre: (min + max) / 2 };
}

/** A rectangle of world space to photograph, and the view to photograph it from. */
interface Framing {
  view: View;
  right: Vector3;
  /** Centre of the picture, in world space. */
  target: Vector3;
  halfWidth: number;
  halfHeight: number;
}

function screenRight(view: View): Vector3 {
  return view.up.clone().cross(view.forward);
}

export interface ModelThumbnail {
  dataUrl: string;
  /** Where the lenses ended up in the rendered picture. */
  geometry: { aspect: number; lensLeftX: number; lensRightX: number; lensY: number };
}

/**
 * Renders the frame front-on as a transparent PNG, and reports where the lens
 * centres landed in it.
 *
 * The geometry is measured rather than assumed: forcing the render to match
 * `DEFAULT_OVERLAY_GEOMETRY` would mean cropping the frame to put its lenses
 * at those fractions, cutting the temple ends off the picture. Framing the
 * whole frame and reporting the real fractions keeps the image complete and
 * still lands correctly on the eyes in the 2D try-on.
 */
export async function renderModelThumbnail(url: string): Promise<ModelThumbnail> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  const canvas = document.createElement("canvas");

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    // The pixels are read back after rendering to work out the framing, and
    // without this the buffer may already have been discarded by then.
    preserveDrawingBuffer: true,
  });
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;

  try {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    if (!(Math.max(size.x, size.y, size.z) > 0)) {
      throw new Error("The 3D model has no measurable geometry.");
    }

    const scene = new Scene();
    scene.add(model);
    // Flat and bright: this is a catalogue image, not the try-on, so it wants
    // even lighting rather than the dramatic key light of a live scene.
    scene.add(new AmbientLight(0xffffff, 2.2));
    const keyLight = new DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(0.2, 0.5, 1);
    scene.add(keyLight);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(-0.5, -0.3, 0.8);
    scene.add(fill);

    const boxCentre = box.getCenter(new Vector3());

    /**
     * Points the camera at the model along `view` and draws it, covering
     * `halfWidth`/`halfHeight` world units either side of `target`.
     */
    const draw = (framing: Framing, pixelWidth: number) => {
      const { view, target, halfWidth, halfHeight } = framing;
      const width = Math.max(2, Math.round(pixelWidth));
      const height = Math.max(2, Math.round((width * halfHeight) / halfWidth));
      canvas.width = width;
      canvas.height = height;
      renderer.setSize(width, height, false);

      const depth = spanAlong(box, view.forward);
      const camera = new OrthographicCamera(
        -halfWidth,
        halfWidth,
        halfHeight,
        -halfHeight,
        0.01,
        (depth.max - depth.min) * 4 + 10
      );
      camera.up.copy(view.up);
      // Straight on, from outside the model's own depth, so the temple arms
      // recede behind the frame exactly as they would in a product photo.
      camera.position
        .copy(target)
        .addScaledVector(view.forward, depth.max - target.dot(view.forward) + (depth.max - depth.min) + 1);
      camera.lookAt(target);
      renderer.render(scene, camera);
      return readMask(canvas);
    };

    /** Frames the model's whole bounding box, generously, for a given view. */
    const wholeBox = (view: View, margin: number): Framing => {
      const right = screenRight(view);
      const across = spanAlong(box, right);
      const upward = spanAlong(box, view.up);
      // A frame front with no arms is perfectly flat from the side, and a
      // zero-width frustum renders nothing at all.
      const flattest = Math.max(size.x, size.y, size.z) * 0.02;
      return {
        view,
        right,
        target: new Vector3()
          .addScaledVector(right, across.centre)
          .addScaledVector(view.up, upward.centre)
          .addScaledVector(view.forward, boxCentre.dot(view.forward)),
        halfWidth: (Math.max(across.max - across.min, flattest) / 2) * margin,
        halfHeight: (Math.max(upward.max - upward.min, flattest) / 2) * margin,
      };
    };

    const view = chooseView((candidate) => {
      const framing = wholeBox(candidate, 1.1);
      const mask = draw(framing, PROBE_WIDTH);
      const bounds = maskBounds(mask);
      return bounds
        ? { view: candidate, mask, bounds, unitsPerPx: (framing.halfWidth * 2) / mask.width }
        : null;
    });

    // Pass one: draw the whole bounding box and see where the model actually
    // landed. The box is an upper bound, not a tight one, so this is only a
    // measurement — the picture itself is drawn again below, framed on the
    // pixels rather than on the geometry.
    let framing = wholeBox(view, 1.1);
    let mask = draw(framing, WIDTH);
    let bounds = maskBounds(mask);
    if (!bounds) throw new Error("The 3D model rendered nothing.");
    if (touchesEdge(bounds, mask)) {
      // The bounding box under-reported the model — skinning and morph
      // targets both do this — so the measuring pass clipped it. Pull back
      // and measure again rather than framing on a silhouette that is itself
      // already cut off.
      framing = wholeBox(view, 1.6);
      mask = draw(framing, WIDTH);
      bounds = maskBounds(mask);
      if (!bounds) throw new Error("The 3D model rendered nothing.");
    }

    // Pass two: re-frame on what was drawn, with even padding all round, and
    // draw it again at full resolution. Cropping the measuring pass instead
    // would leave the frame at whatever size the bounding box happened to
    // give it — a model with one stray oversized node renders as a
    // postage-stamp frame in a mostly empty picture.
    const unitsPerPx = (framing.halfWidth * 2) / mask.width;
    const rightOffset = ((bounds.minX + bounds.maxX + 1 - mask.width) / 2) * unitsPerPx;
    const upOffset = -((bounds.minY + bounds.maxY + 1 - mask.height) / 2) * unitsPerPx;
    const contentWidth = bounds.width * unitsPerPx;
    const contentHeight = bounds.height * unitsPerPx;
    const pad = Math.max(contentWidth, contentHeight) * PADDING;

    const framed: Framing = {
      view,
      right: framing.right,
      target: framing.target
        .clone()
        .addScaledVector(framing.right, rightOffset)
        .addScaledVector(view.up, upOffset),
      halfWidth: contentWidth / 2 + pad,
      halfHeight: contentHeight / 2 + pad,
    };
    const finalMask = draw(framed, WIDTH);
    const finalBounds = maskBounds(finalMask);
    if (!finalBounds) throw new Error("The 3D model rendered nothing.");

    // Lens centres: horizontally from the width of the frame as drawn — not
    // from the bounding box, which the invisible meshes inflate — and
    // vertically from the pixels themselves.
    const lensOffsetX = finalBounds.width * (LENS_SPAN_FRACTION / 2);
    const centreX = (finalBounds.minX + finalBounds.maxX + 1) / 2;
    const band = Math.round(finalMask.width * LENS_BAND_FRACTION);
    const lensYs = [centreX - lensOffsetX, centreX + lensOffsetX]
      .map((x) => lensLineY(finalMask, x, band))
      .filter((y): y is number => y !== null);
    const lensPxY = lensYs.length
      ? lensYs.reduce((a, b) => a + b, 0) / lensYs.length
      : finalBounds.minY + finalBounds.height / 2;

    return {
      dataUrl: finalMask.image.toDataURL("image/png"),
      geometry: {
        aspect: finalMask.width / finalMask.height,
        lensLeftX: (centreX - lensOffsetX) / finalMask.width,
        lensRightX: (centreX + lensOffsetX) / finalMask.width,
        lensY: lensPxY / finalMask.height,
      },
    };
  } finally {
    disposeTree(model);
    renderer.dispose();
  }
}

/**
 * Works out which way round the model is, so the picture is a front view.
 *
 * A GLB is *supposed* to arrive facing +Z with Y up, and one that does is
 * left exactly as it is. Plenty don't: a model exported from Blender without
 * the Y-up conversion, or generated by an AI tool, comes in lying on its back
 * or facing sideways, and rendering it front-on then photographs it from
 * above — two thin temple arms and nothing else. The customer sees a picture
 * of a frame that has been sliced in half.
 *
 * The shape of a pair of glasses gives it away without needing to understand
 * the mesh:
 *   - it is much shorter than it is wide or deep, so the shallowest axis is
 *     up;
 *   - seen head-on it is symmetric about its own centre line, and seen from
 *     the side it is not, which picks the facing axis out of the other two;
 *   - from the side, the lens end is tall and the temple end is a thin rail
 *     sitting above the lens centre, which settles which end faces forward
 *     and which way up it goes.
 */
function chooseView(probe: (view: View) => Probe | null): View {
  // How tall, wide and deep the model *draws* — not what its bounding box
  // claims, which one stray node is enough to treble.
  const extents = [Infinity, Infinity, Infinity];
  for (const view of AXIS_PROBES) {
    const measured = probe(view);
    if (!measured) return CONVENTIONAL_VIEW;
    const across = axisIndex(screenRight(view));
    const upward = axisIndex(view.up);
    extents[across] = Math.min(extents[across], measured.bounds.width * measured.unitsPerPx);
    extents[upward] = Math.min(extents[upward], measured.bounds.height * measured.unitsPerPx);
  }

  const upIndex = extents.indexOf(Math.min(...extents));
  const up = AXES[upIndex].clone();
  const look = (index: number) => {
    const measured = probe({ forward: AXES[index].clone(), up: up.clone() });
    return measured && { ...measured, score: mirrorScore(measured.mask, measured.bounds) };
  };
  const horizontals = [0, 1, 2].filter((index) => index !== upIndex);
  const first = look(horizontals[0]);
  const second = look(horizontals[1]);
  if (!first || !second) return CONVENTIONAL_VIEW;
  const [front, side] = first.score >= second.score ? [first, second] : [second, first];

  // Two views that look equally like the front — a perfectly round model, or
  // one whose arms are gone. Trust the documented convention over a coin toss.
  if (front.score - side.score < 0.02) return CONVENTIONAL_VIEW;

  // In the side view the horizontal axis is the model's front-to-back one, so
  // the taller half is the lens end: that is the half the camera should be on.
  const heights = columnHeights(side.mask, side.bounds);
  const half = Math.floor(heights.length / 2);
  const meanHeight = (from: number, to: number) =>
    heights.slice(from, to).reduce((a, b) => a + b, 0) / Math.max(1, to - from);
  const lensEndIsOnTheRight = meanHeight(half, heights.length) > meanHeight(0, half);
  const sideRight = screenRight(side.view);
  const forward = lensEndIsOnTheRight ? sideRight : sideRight.negate();

  // The temple arms run back from the brow, above the lens centres, so if
  // they came out below it the model is upside down.
  const templeMeanY = lensEndIsOnTheRight
    ? meanRow(side.mask, side.bounds, side.bounds.minX, side.bounds.minX + half - 1)
    : meanRow(side.mask, side.bounds, side.bounds.minX + half, side.bounds.maxX);
  const upsideDown =
    templeMeanY !== null && templeMeanY > side.bounds.minY + side.bounds.height / 2;

  return { forward, up: upsideDown ? up.negate() : up };
}
