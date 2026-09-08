// Self-hosted assets (copied from node_modules at setup time) are tried
// first so the try-on experience works without depending on a CDN at
// runtime. If they're missing for any reason, we fall back to the public
// MediaPipe CDN.
export const WASM_PATH_LOCAL = "/mediapipe/wasm";
export const WASM_PATH_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

export const MODEL_PATH_LOCAL = "/mediapipe/face_landmarker.task";
export const MODEL_PATH_CDN =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
