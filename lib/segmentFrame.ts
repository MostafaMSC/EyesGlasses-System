/**
 * Real neural background/foreground segmentation for frame photos, replacing
 * colour-heuristic background removal with an actual trained model.
 *
 * Runs entirely client-side via onnxruntime-web (WASM), using u2netp — a
 * small salient-object-segmentation network (Apache-2.0, ~4.6MB) — self-hosted
 * the same way the live try-on already self-hosts its MediaPipe model (see
 * lib/mediapipeConfig.ts / lib/useFaceLandmarker.ts).
 *
 * A trained model handles what colour/edge heuristics structurally cannot:
 * rimless wire frames, gradient-tinted lenses, gold/metal reflections, and
 * backgrounds that are patterned or textured rather than a flat colour —
 * because it has learned "this is a pair of glasses" as a concept, not
 * "this pixel resembles that other pixel".
 *
 * One real nuance this brings, rather than hides: the model marks a pixel
 * transparent when it looks like backdrop, which is exactly what a genuinely
 * clear/optical lens does in a photo — so those come out correctly
 * transparent for free. A tinted/sunglasses lens looks like solid material
 * to the model (it has no notion of "glass" specifically), so it comes back
 * opaque, same as the rim — that case still needs the calling code's
 * colour-based lens search, just now running inside an already-accurate
 * silhouette instead of having to fight background contamination too.
 */

import {
  ORT_WASM_DIR_LOCAL,
  SEGMENTATION_INPUT_SIZE,
  SEGMENTATION_MEAN,
  SEGMENTATION_MODEL_LOCAL,
  SEGMENTATION_STD,
} from "@/lib/segmentationConfig";

// The bare "onnxruntime-web" entry point resolves to the full bundle
// (webgl/webgpu/JSEP-capable), which tries to load a *different* set of WASM
// binaries than the ones self-hosted here and 404s. The "/wasm" subpath is
// the WASM-only build matching the plain (non-JSEP) files actually copied
// into public/onnxruntime/.
type OrtModule = typeof import("onnxruntime-web/wasm");

/**
 * The underlying WASM runtime is expensive to spin up (~1s) and, like the
 * MediaPipe landmarker, should not be created twice concurrently — so it is
 * created at most once per page load and reused. See useFaceLandmarker.ts for
 * the same rationale spelled out in more detail.
 */
let sharedSessionPromise: Promise<{ ort: OrtModule; session: import("onnxruntime-web/wasm").InferenceSession }> | null =
  null;

async function loadSession() {
  const ort = (await import("onnxruntime-web/wasm")) as OrtModule;
  ort.env.wasm.wasmPaths = ORT_WASM_DIR_LOCAL;
  // Single-threaded: the shipped WASM binary supports multi-threading via
  // SharedArrayBuffer, which browsers only expose on a cross-origin-isolated
  // page (COOP/COEP response headers). Forcing one thread avoids requiring
  // that server configuration, at an acceptable cost for a one-off admin
  // upload rather than a per-frame live pipeline.
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(SEGMENTATION_MODEL_LOCAL, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return { ort, session };
}

function getSharedSession() {
  if (!sharedSessionPromise) {
    sharedSessionPromise = loadSession().catch((err) => {
      // Let a later attempt retry from scratch instead of staying broken.
      sharedSessionPromise = null;
      throw err;
    });
  }
  return sharedSessionPromise;
}

/** Draws `source` (at its own w/h) scaled into a fresh size×size canvas, returning its 2D context. */
function drawScaled(source: CanvasImageSource, sourceW: number, sourceH: number, size: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(source, 0, 0, sourceW, sourceH, 0, 0, size, size);
  return ctx;
}

/**
 * Runs segmentation on `sourceCanvas` (already at the pipeline's working
 * resolution, w x h) and returns a w*h array of per-pixel foreground
 * confidence scaled to 0-255 — directly usable as an alpha channel.
 *
 * The model itself takes a fixed 320x320 input regardless of the source
 * size; downscaling for inference and upscaling the resulting mask back to
 * w x h both go through the canvas's own native image resampling (a
 * gray-encoded image redrawn at the target size) rather than a hand-rolled
 * resize loop — simpler and higher quality.
 */
export async function segmentAlpha(sourceCanvas: HTMLCanvasElement, w: number, h: number): Promise<Uint8ClampedArray> {
  const { ort, session } = await getSharedSession();

  const inputCtx = drawScaled(sourceCanvas, w, h, SEGMENTATION_INPUT_SIZE);
  const rgba = inputCtx.getImageData(0, 0, SEGMENTATION_INPUT_SIZE, SEGMENTATION_INPUT_SIZE).data;

  const n = SEGMENTATION_INPUT_SIZE * SEGMENTATION_INPUT_SIZE;
  const chw = new Float32Array(3 * n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      const v = rgba[i + c] / 255;
      chw[c * n + p] = (v - SEGMENTATION_MEAN[c]) / SEGMENTATION_STD[c];
    }
  }

  const inputTensor = new ort.Tensor("float32", chw, [1, 3, SEGMENTATION_INPUT_SIZE, SEGMENTATION_INPUT_SIZE]);
  const feeds: Record<string, import("onnxruntime-web/wasm").Tensor> = {};
  feeds[session.inputNames[0]] = inputTensor;
  const results = await session.run(feeds);
  // The first output is the network's final, full-resolution saliency map
  // (already sigmoid-activated, 0..1); the remaining outputs are the
  // intermediate deep-supervision side-maps used only during training.
  const mask = results[session.outputNames[0]].data as Float32Array;

  // Encode the 320x320 mask as a flat grayscale image, then let the canvas
  // upscale it to the working resolution with native smoothing.
  const maskImageData = new ImageData(SEGMENTATION_INPUT_SIZE, SEGMENTATION_INPUT_SIZE);
  for (let p = 0; p < n; p++) {
    const v = Math.round(clamp01(mask[p]) * 255);
    const i = p * 4;
    maskImageData.data[i] = v;
    maskImageData.data[i + 1] = v;
    maskImageData.data[i + 2] = v;
    maskImageData.data[i + 3] = 255;
  }
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = SEGMENTATION_INPUT_SIZE;
  maskCanvas.height = SEGMENTATION_INPUT_SIZE;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("Canvas is unavailable in this browser.");
  maskCtx.putImageData(maskImageData, 0, 0);

  // The 320x320 input was itself a non-uniform squeeze of the w x h working
  // image (unless it happens to be square) — scaling the mask back with the
  // same non-uniform stretch inverts that correctly, so this draws straight
  // to w x h rather than through an intermediate square canvas.
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = w;
  finalCanvas.height = h;
  const finalCtx = finalCanvas.getContext("2d");
  if (!finalCtx) throw new Error("Canvas is unavailable in this browser.");
  finalCtx.drawImage(maskCanvas, 0, 0, SEGMENTATION_INPUT_SIZE, SEGMENTATION_INPUT_SIZE, 0, 0, w, h);
  const finalData = finalCtx.getImageData(0, 0, w, h).data;

  const alpha = new Uint8ClampedArray(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = finalData[p * 4];
  return alpha;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
