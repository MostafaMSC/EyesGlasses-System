/**
 * Optional, higher-accuracy alternative to lib/segmentFrame.ts's in-browser
 * segmentAlpha: calls the Python ML service (see python-service/README.md)
 * through /api/segment-frame, which runs the full u2net model with
 * alpha-matting edge refinement instead of the quantized u2netp running
 * single-threaded under onnxruntime-web/WASM.
 *
 * Same return contract as segmentAlpha (a w*h array of per-pixel foreground
 * alpha, 0-255) so lib/processFrameImage.ts can try this first and fall back
 * to segmentAlpha, then the colour-heuristic pipeline, without either path
 * needing to know which one ran.
 */
export async function segmentAlphaServer(
  sourceCanvas: HTMLCanvasElement,
  w: number,
  h: number
): Promise<Uint8ClampedArray> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    sourceCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode canvas."))), "image/png");
  });

  const formData = new FormData();
  formData.set("file", blob, "frame.png");

  const response = await fetch("/api/segment-frame", { method: "POST", body: formData });
  if (!response.ok) throw new Error("Server-side segmentation unavailable.");

  const maskBlob = await response.blob();
  const maskBitmap = await createImageBitmap(maskBlob);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const ctx = maskCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(maskBitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const alpha = new Uint8ClampedArray(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = data[p * 4]; // grayscale PNG: R === G === B
  return alpha;
}
