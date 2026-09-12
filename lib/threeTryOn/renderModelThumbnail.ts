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
import { stripLenses } from "@/lib/threeTryOn/lensGeometry";

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

/**
 * The first render is deliberately oversized — twice the model's bounding
 * box each way — because the box has proven unreliable on generated models
 * (it can be inflated by geometry that draws nothing, leaving the real frame
 * off-centre and running off an edge). Rendering wide and cropping to the
 * pixels that actually appeared is immune to that. The width keeps the crop
 * at a useful resolution.
 */
const RENDER_WIDTH = 2400;
const OVERSCAN = 2;
/** Same assumption the loader makes: lens centres at 45% of the total width. */
const LENS_SPAN_FRACTION = 0.45;
/** Half-width of the pixel band sampled to locate the lens line. */
const LENS_BAND_FRACTION = 0.03;
/** Breathing room around the frame, as a fraction of its size. */
const PADDING = 0.06;

/**
 * Vertical centre of the drawn frame at one lens, in pixels.
 *
 * Read off the render rather than computed from the mesh: the optical centre
 * is what sits on the wearer's pupil, and it is the midpoint of the lens as
 * actually drawn. Sampled over a band of columns so a gap between the rim and
 * a bridge detail can't throw it off.
 */
function lensLineY(canvas: HTMLCanvasElement, centreX: number, halfBand: number): number | null {
  const scratch = document.createElement("canvas");
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const ctx = scratch.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0);
  const { data } = ctx.getImageData(0, 0, scratch.width, scratch.height);

  const from = Math.max(0, Math.round(centreX - halfBand));
  const to = Math.min(scratch.width - 1, Math.round(centreX + halfBand));
  let minY = Infinity;
  let maxY = -Infinity;
  for (let x = from; x <= to; x++) {
    for (let y = 0; y < scratch.height; y++) {
      if (data[(y * scratch.width + x) * 4 + 3] <= 12) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minY) ? (minY + maxY) / 2 : null;
}

/** Pixel bounds of everything non-transparent in a render. */
function opaqueBounds(
  canvas: HTMLCanvasElement
): { minX: number; minY: number; width: number; height: number } | null {
  // A WebGL canvas has no 2D context, so copy it into one to read pixels.
  const scratch = document.createElement("canvas");
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const sctx = scratch.getContext("2d");
  if (!sctx) return null;
  sctx.drawImage(canvas, 0, 0);

  const { data } = sctx.getImageData(0, 0, scratch.width, scratch.height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < scratch.height; y++) {
    for (let x = 0; x < scratch.width; x++) {
      // Ignore near-transparent antialiasing fringe.
      if (data[(y * scratch.width + x) * 4 + 3] <= 12) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
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
export async function renderModelThumbnail(
  url: string,
  options: { hideLenses?: boolean } = {}
): Promise<ModelThumbnail> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  // The card should show what the customer will actually wear.
  if (options.hideLenses) stripLenses(model);

  const canvas = document.createElement("canvas");

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    // The pixels are read back after rendering to work out the crop, and
    // without this the buffer may already have been discarded by then.
    preserveDrawingBuffer: true,
  });
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;

  try {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    if (!(size.x > 0)) throw new Error("The 3D model has no measurable geometry.");

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

    const centreX = (box.min.x + box.max.x) / 2;
    const centreY = (box.min.y + box.max.y) / 2;
    const viewWidth = size.x * OVERSCAN;
    const viewHeight = Math.max(size.y, size.x * 0.1) * OVERSCAN;

    canvas.width = RENDER_WIDTH;
    canvas.height = Math.max(2, Math.round(RENDER_WIDTH * (viewHeight / viewWidth)));
    renderer.setSize(canvas.width, canvas.height, false);

    const camera = new OrthographicCamera(
      centreX - viewWidth / 2,
      centreX + viewWidth / 2,
      centreY + viewHeight / 2,
      centreY - viewHeight / 2,
      0.01,
      size.z * 4 + 10
    );
    // Straight on from the front, looking back along -Z, so the temple arms
    // recede behind the frame exactly as they would in a product photo.
    camera.position.set(centreX, centreY, box.max.z + size.z + 1);
    camera.lookAt(centreX, centreY, 0);
    renderer.render(scene, camera);

    // World units per rendered pixel, for mapping between the two below.
    const unitsPerPx = viewWidth / canvas.width;
    const worldLeft = centreX - viewWidth / 2;

    const bounds = opaqueBounds(canvas);
    if (!bounds) throw new Error("The 3D model rendered nothing.");

    // Crop to what was actually drawn, plus even padding on all sides.
    const pad = Math.round(Math.max(bounds.width, bounds.height) * PADDING);
    const cropX = bounds.minX - pad;
    const cropY = bounds.minY - pad;
    const cropW = bounds.width + pad * 2;
    const cropH = bounds.height + pad * 2;

    const out = document.createElement("canvas");
    out.width = cropW;
    out.height = cropH;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Could not crop the render.");
    ctx.drawImage(canvas, -cropX, -cropY);

    // Lens centres: horizontally from the model's own width, vertically from
    // the pixels themselves. Geometry can't be trusted for the vertical —
    // these models turn out to carry meshes that inflate the bounding box and
    // the vertex averages while drawing nothing.
    const lensOffsetX = size.x * (LENS_SPAN_FRACTION / 2);
    const toRenderX = (worldX: number) => (worldX - worldLeft) / unitsPerPx;
    const lensPxY =
      lensLineY(canvas, toRenderX(centreX - lensOffsetX), Math.round(canvas.width * LENS_BAND_FRACTION)) ??
      bounds.minY + bounds.height / 2;
    const toCropX = (worldX: number) => toRenderX(worldX) - cropX;

    return {
      dataUrl: out.toDataURL("image/png"),
      geometry: {
        aspect: cropW / cropH,
        lensLeftX: toCropX(centreX - lensOffsetX) / cropW,
        lensRightX: toCropX(centreX + lensOffsetX) / cropW,
        lensY: (lensPxY - cropY) / cropH,
      },
    };
  } finally {
    disposeTree(model);
    renderer.dispose();
  }
}
