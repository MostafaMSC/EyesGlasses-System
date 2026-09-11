"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Product } from "@/data/products";
import { buildFallbackModel, loadGlassesModel, type GlassesModel } from "@/lib/threeTryOn/glassesModel";
import { TryOnScene, type FaceFrameInput } from "@/lib/threeTryOn/tryOnScene";

/** On-screen rectangle the camera feed actually occupies, in CSS pixels. */
export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GlassesOverlay3DHandle {
  /**
   * Places the frame for this video frame, or hides it when passed null.
   * Returns false if it couldn't be placed — e.g. no usable head-pose matrix,
   * which is the caller's cue to fall back to the 2D overlay.
   */
  update(input: FaceFrameInput | null): boolean;
  /**
   * Re-renders and hands back the drawing buffer, for compositing into a
   * captured photo. The WebGL canvas is not preserved between frames, so it
   * has to be redrawn in the same synchronous step that reads it.
   */
  captureCanvas(): HTMLCanvasElement | null;
}

export const GlassesOverlay3D = forwardRef<
  GlassesOverlay3DHandle,
  { product: Product; rect: OverlayRect | null }
>(function GlassesOverlay3D({ product, rect }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TryOnScene | null>(null);
  /** Models we built ourselves and must dispose; cached GLBs are shared. */
  const ownedModelRef = useRef<GlassesModel | null>(null);
  const [modelError, setModelError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new TryOnScene(canvas);
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
      scene.dispose();
      ownedModelRef.current?.dispose();
      ownedModelRef.current = null;
    };
  }, []);

  const modelSource = product.tryOn.model3d;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;

    const install = (model: GlassesModel, owned: boolean) => {
      if (cancelled) {
        if (owned) model.dispose();
        return;
      }
      scene.setModel(model);
      // Replace whatever we were responsible for, now that it is detached.
      if (ownedModelRef.current && ownedModelRef.current !== model) {
        ownedModelRef.current.dispose();
      }
      ownedModelRef.current = owned ? model : null;
    };

    setModelError(false);
    if (modelSource) {
      loadGlassesModel(modelSource)
        .then((model) => install(model, false))
        .catch((err) => {
          console.error("[try-on] Could not load the 3D frame model", err);
          if (cancelled) return;
          setModelError(true);
          // Something on the face beats an empty overlay, and the placeholder
          // still exercises the tracking.
          install(buildFallbackModel(product.tryOn), true);
        });
    } else {
      install(buildFallbackModel(product.tryOn), true);
    }

    return () => {
      cancelled = true;
    };
  }, [modelSource, product.tryOn]);

  useEffect(() => {
    if (!rect) return;
    sceneRef.current?.resize(rect.width, rect.height, rect.width / rect.height);
  }, [rect]);

  useImperativeHandle(
    ref,
    () => ({
      update(input) {
        const scene = sceneRef.current;
        if (!scene) return false;
        const placed = input ? scene.update(input) : (scene.clearFace(), false);
        scene.render();
        return placed;
      },
      captureCanvas() {
        const scene = sceneRef.current;
        if (!scene) return null;
        scene.render();
        return scene.canvas;
      },
    }),
    []
  );

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{
          left: rect?.left ?? 0,
          top: rect?.top ?? 0,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        }}
      />
      {modelError && (
        // Mirrored back, because the whole camera stage is flipped for a
        // selfie view and text inside it would otherwise read backwards.
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-6" style={{ transform: "scaleX(-1)" }}>
          <p className="glass-dark rounded-full px-4 py-2 text-center text-xs font-semibold text-white">
            تعذّر تحميل المجسم ثلاثي الأبعاد، يتم عرض شكل تقريبي
          </p>
        </div>
      )}
    </>
  );
});
