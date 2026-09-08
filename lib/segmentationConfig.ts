// Self-hosted assets (copied from node_modules at setup time), matching the
// pattern used for MediaPipe in mediapipeConfig.ts — see README.md
// "Updating the model assets" for how to re-copy these after an upgrade.
export const ORT_WASM_DIR_LOCAL = "/onnxruntime/";
export const SEGMENTATION_MODEL_LOCAL = "/models/u2netp.onnx";

/** u2netp (U^2-Net, small variant) expects a fixed 320x320 RGB input. */
export const SEGMENTATION_INPUT_SIZE = 320;
export const SEGMENTATION_MEAN = [0.485, 0.456, 0.406] as const;
export const SEGMENTATION_STD = [0.229, 0.224, 0.225] as const;
