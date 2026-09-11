"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { MODEL_PATH_CDN, MODEL_PATH_LOCAL, WASM_PATH_CDN, WASM_PATH_LOCAL } from "@/lib/mediapipeConfig";

export type LandmarkerStatus = "idle" | "loading" | "ready" | "error";

/**
 * MediaPipe's WASM runtime prints informational lines such as
 * "INFO: Created TensorFlow Lite XNNPACK delegate for CPU" through its
 * Emscripten stdout shim, which lands on `console.error` and shows up red in
 * devtools even though nothing failed.
 *
 * It is emitted synchronously from inside the very first `detectForVideo`
 * call, so the filter is installed around *that one call* and torn down in a
 * `finally`. Patching `console.error` globally would make every unrelated
 * error in the app appear to originate from this file, hiding where real
 * problems come from.
 */
/** MediaPipe's glog/stdout chatter — none of it indicates a failure. */
function isMediapipeNotice(arg: unknown): boolean {
  if (typeof arg !== "string") return false;
  return (
    arg.startsWith("INFO:") ||
    arg.includes("XNNPACK delegate") ||
    arg.includes("Graph successfully started") ||
    // glog lines, e.g. "W0907 11:04:36.912999 2196592 gl_context.cc:1119] ..."
    /^[WIE]\d{4} \d{2}:\d{2}:\d{2}/.test(arg)
  );
}

/**
 * Runs the MediaPipe module load with console methods temporarily filtered,
 * then restores them.
 *
 * The Emscripten glue captures `console.*` *by reference* as it loads
 * (`var err = console.error.bind(console)`), so a filter only takes effect if
 * it is installed at that moment — patching later does nothing. Restoring
 * immediately afterwards means the WASM keeps our filtered reference forever
 * while the rest of the app gets the pristine console back, so unrelated
 * errors keep their real call sites.
 */
async function withMediapipeNoticesSilenced<T>(load: () => Promise<T>): Promise<T> {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const wrap =
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (isMediapipeNotice(args[0])) return;
      fn(...args);
    };

  console.log = wrap(original.log.bind(console));
  console.warn = wrap(original.warn.bind(console));
  console.error = wrap(original.error.bind(console));
  try {
    return await load();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
}

async function createLandmarker(wasmPath: string, modelPath: string) {
  return withMediapipeNoticesSilenced(async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      // The 4x4 head-pose matrix the 3D try-on renders from. MediaPipe solves
      // it by fitting its canonical metric head to the landmarks, which gives
      // a real 3D rotation — the thing the 2D overlay could only approximate
      // with a CSS tilt. Cheap to ask for: it comes out of the same inference.
      outputFacialTransformationMatrixes: true,
    });
  });
}

/**
 * The underlying MediaPipe WASM runtime is a single global Emscripten module
 * — creating it twice concurrently throws ("Unable to add filesystem:
 * <illegal path>"). That happens easily in React: Strict Mode double-invokes
 * effects in dev, and this hook is also only ever used by one component. So
 * the landmarker is created at most once per page load and shared/reused
 * for every try-on session instead of being torn down and recreated.
 */
let sharedLandmarkerPromise: Promise<FaceLandmarker> | null = null;

function getSharedLandmarker(): Promise<FaceLandmarker> {
  if (!sharedLandmarkerPromise) {
    sharedLandmarkerPromise = createLandmarker(WASM_PATH_LOCAL, MODEL_PATH_LOCAL).catch(() =>
      createLandmarker(WASM_PATH_CDN, MODEL_PATH_CDN)
    );
    sharedLandmarkerPromise.catch(() => {
      // Let a later try-on attempt retry from scratch instead of staying broken.
      sharedLandmarkerPromise = null;
    });
  }
  return sharedLandmarkerPromise;
}

/**
 * Lazily loads the MediaPipe Face Landmarker only while `active` is true, so
 * the model (a few MB) never loads on regular browsing — only once the user
 * opens the virtual try-on.
 */
export function useFaceLandmarker(active: boolean) {
  const [status, setStatus] = useState<LandmarkerStatus>("idle");
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      setStatus("loading");
      try {
        const landmarker = await getSharedLandmarker();
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setStatus("ready");
      } catch (err) {
        console.error("Failed to load face landmarker", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  const detect = useCallback((video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null => {
    const landmarker = landmarkerRef.current;
    if (!landmarker) return null;
    return landmarker.detectForVideo(video, timestampMs);
  }, []);

  return { status, detect };
}
