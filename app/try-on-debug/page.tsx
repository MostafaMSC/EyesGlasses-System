"use client";

/**
 * Development harness for the try-on geometry (not linked from the site).
 *
 * Feeds a synthetic, parametric face through the real
 * computeFacePose -> computeOverlayPlacement -> GlassesOverlay pipeline so the
 * placement math can be verified without a camera, and per-product offsets can
 * be tuned. Visit /try-on-debug.
 *
 * It renders through exactly the same inputs the live try-on passes to the
 * overlay — placement, the ear clip, and the side-photo cross-fade — plus the
 * same selfie mirroring, so what you see here is what a customer gets. Two
 * deliberate differences remain:
 *
 * - **No pose smoothing.** The live try-on runs the pose through
 *   `FacePoseSmoother`, which needs a stream of frames to converge. Here each
 *   slider position is a single frame, so the raw pose is the honest answer;
 *   smoothing would just show a value lagging behind the slider.
 * - **No cover-crop.** The "video" is the same size as the display, so
 *   `computeCoverTransform` is an identity. A real camera feed is cropped to
 *   fill the stage, which scales and offsets everything uniformly.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Euler, MathUtils, Matrix4 } from "three";
import { useProductStore } from "@/lib/productStore";
import { computeFacePose, PitchCalibrator, type NormalizedPoint } from "@/lib/faceGeometry";
import {
  computeEarClip,
  computeOverlayPlacement,
  DEFAULT_OVERLAY_GEOMETRY,
  earClipToCssPath,
  overlayTransform,
  selectSideOverlay,
} from "@/lib/overlayPlacement";
import { GlassesOverlay } from "@/components/try-on/GlassesOverlay";
import { GlassesOverlay3D, type GlassesOverlay3DHandle } from "@/components/try-on/GlassesOverlay3D";
import { MEDIAPIPE_VERTICAL_FOV_DEG } from "@/lib/threeTryOn/faceMatrix";

const VIDEO_W = 640;
const VIDEO_H = 480;

const LENS_SPAN_FRAC = DEFAULT_OVERLAY_GEOMETRY.lensRightX - DEFAULT_OVERLAY_GEOMETRY.lensLeftX;
/** Assumed real temple-to-temple width, to put the synthetic head at a believable distance. */
const FACE_WIDTH_CM = 14;

// Canonical head model in face-local units (half head width = 1).
// x: right, y: down, z: toward camera. Eye line is y = 0.
const HEAD_MODEL: Record<number, [number, number, number]> = {
  10: [0, -1.05, -0.05], // forehead
  152: [0, 1.3, 0.1], // chin
  168: [0, -0.24, 0.3], // nose-bridge top
  234: [-1.0, 0.0, -0.35], // left temple
  454: [1.0, 0.0, -0.35], // right temple
  33: [-0.62, 0.0, 0.05], // left eye outer
  133: [-0.22, 0.0, 0.18], // left eye inner
  362: [0.22, 0.0, 0.18], // right eye inner
  263: [0.62, 0.0, 0.05], // right eye outer
  468: [-0.42, 0.0, 0.12], // left iris
  473: [0.42, 0.0, 0.12], // right iris
};

function buildSyntheticLandmarks(opts: {
  yawDeg: number;
  rollDeg: number;
  /** Head tilt up/down (rotation about the horizontal axis) before yaw/roll. */
  pitchDeg?: number;
  headHalfWidthPx: number;
  centerX: number;
  centerY: number;
}): NormalizedPoint[] {
  const { yawDeg, rollDeg, pitchDeg = 0, headHalfWidthPx, centerX, centerY } = opts;
  const yaw = (yawDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;

  const landmarks: NormalizedPoint[] = [];
  for (const [indexStr, [x, y, z]] of Object.entries(HEAD_MODEL)) {
    // Rotate about the horizontal axis (pitch: chin tucked/head tilted back),
    // then the vertical axis (yaw), then project orthographically.
    const yp = y * Math.cos(pitch) - z * Math.sin(pitch);
    const zp = y * Math.sin(pitch) + z * Math.cos(pitch);
    const xr = x * Math.cos(yaw) + zp * Math.sin(yaw);
    // Scale to pixels, then apply in-plane roll.
    const px = xr * headHalfWidthPx;
    const py = yp * headHalfWidthPx;
    const rx = px * Math.cos(roll) - py * Math.sin(roll);
    const ry = px * Math.sin(roll) + py * Math.cos(roll);

    landmarks[Number(indexStr)] = {
      x: (centerX + rx) / VIDEO_W,
      y: (centerY + ry) / VIDEO_H,
    };
  }
  return landmarks;
}

export default function TryOnDebugPage() {
  const { products } = useProductStore();
  const [yawDeg, setYawDeg] = useState(0);
  const [rollDeg, setRollDeg] = useState(0);
  const [pitchDeg, setPitchDeg] = useState(0);
  const [headHalfWidthPx, setHeadHalfWidthPx] = useState(110);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [showIris, setShowIris] = useState(true);
  const [render3d, setRender3d] = useState(false);
  /** Defaults on, so the harness matches the live try-on out of the box. */
  const [mirrored, setMirrored] = useState(true);
  const overlay3dRef = useRef<GlassesOverlay3DHandle>(null);

  // Falls back if the selected product was deleted from the admin panel.
  const product = products.find((p) => p.id === productId) ?? products[0];

  const { landmarks, pose, placement, sideOverlay, earClip } = useMemo(() => {
    const lm = buildSyntheticLandmarks({
      yawDeg,
      rollDeg,
      pitchDeg,
      headHalfWidthPx,
      centerX: VIDEO_W / 2,
      centerY: VIDEO_H / 2,
    });
    if (!showIris) {
      delete lm[468];
      delete lm[473];
    }
    // Fresh calibrator each run, primed on a frontal face, so the reported
    // pitch is the deviation from neutral — same as a real session.
    const calibrator = new PitchCalibrator();
    const frontal = buildSyntheticLandmarks({
      yawDeg: 0,
      rollDeg: 0,
      headHalfWidthPx,
      centerX: VIDEO_W / 2,
      centerY: VIDEO_H / 2,
    });
    computeFacePose(frontal, VIDEO_W, VIDEO_H, calibrator);

    const video = { videoWidth: VIDEO_W, videoHeight: VIDEO_H };
    const display = { width: VIDEO_W, height: VIDEO_H };

    const p = computeFacePose(lm, VIDEO_W, VIDEO_H, calibrator);
    const pl = p && product ? computeOverlayPlacement(p, product.tryOn, video, display) : null;

    // The live try-on feeds two more things into the overlay, and leaving them
    // out here meant the harness quietly showed different behaviour from the
    // real thing: the temple arm wasn't clipped at the ear, and a product with
    // side photos never crossed over to them as the head turned.
    const side = p && product ? selectSideOverlay(p, product.tryOn, video, display) : null;
    const clip = p && pl ? computeEarClip(p, pl, video, display) : null;

    return { landmarks: lm, pose: p, placement: pl, sideOverlay: side, earClip: clip };
  }, [yawDeg, rollDeg, pitchDeg, headHalfWidthPx, product, showIris]);

  /**
   * Drives the 3D overlay from the same synthetic pose.
   *
   * The rotation here is *reconstructed* from the slider angles — in a real
   * session it comes from MediaPipe's head-pose matrix instead, so the exact
   * sign conventions below are only as good as this reconstruction. What this
   * does verify without a camera: the model loads and fits, the camera
   * intrinsics put it on the eyes at the right size, and the head mask hides
   * the temple arms as the head turns.
   */
  useEffect(() => {
    if (!render3d || !pose || !product) return;
    let raf = 0;

    const faceWidthFrac = pose.templeWidth / VIDEO_W;

    // Distance that makes a FACE_WIDTH_CM-wide head project to the width the
    // synthetic landmarks actually span, so perspective and the head mask are
    // physically consistent with the drawn face.
    const aspect = VIDEO_W / VIDEO_H;
    const tanHalfFov = Math.tan(MathUtils.DEG2RAD * MEDIAPIPE_VERTICAL_FOV_DEG * 0.5);
    const distance = FACE_WIDTH_CM / (faceWidthFrac * 2 * tanHalfFov * aspect);

    const matrix = new Matrix4().makeRotationFromEuler(
      // Three.js is y-up with +Z toward the camera; the synthetic head model
      // above is y-down, hence the inverted pitch and roll.
      new Euler(
        MathUtils.DEG2RAD * -pitchDeg,
        MathUtils.DEG2RAD * yawDeg,
        MathUtils.DEG2RAD * -rollDeg,
        "YXZ"
      )
    );
    matrix.setPosition(0, 0, -distance);

    const input = {
      // Shaped like MediaPipe's payload, column-major as Three.js stores it.
      matrixData: { rows: 4, columns: 4, data: matrix.toArray() },
      timestampMs: 0,
      anchorU: pose.anchorX / VIDEO_W,
      anchorV: pose.anchorY / VIDEO_H,
      lensSpanFrac: (pose.width * product.tryOn.scale * LENS_SPAN_FRAC) / VIDEO_W,
      faceWidthFrac,
      offsetX: product.tryOn.offsetX,
      offsetY: product.tryOn.offsetY,
      rollOffsetDeg: product.tryOn.rotationOffset,
    };

    // Kept running rather than pushed once: the model arrives asynchronously,
    // and the overlay draws nothing until it is there. A live timestamp lets
    // the pose smoother advance, so a slider change eases in as it would on a
    // real head rather than snapping.
    const tick = () => {
      overlay3dRef.current?.update({ ...input, timestampMs: performance.now() });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [render3d, pose, landmarks, product, headHalfWidthPx, yawDeg, pitchDeg, rollDeg]);

  const pt = (i: number) =>
    landmarks[i] ? { x: landmarks[i].x * VIDEO_W, y: landmarks[i].y * VIDEO_H } : null;

  const eyeL = pt(468) ?? pt(33);
  const eyeR = pt(473) ?? pt(263);
  const templeL = pt(234)!;
  const templeR = pt(454)!;
  const forehead = pt(10)!;
  const chin = pt(152)!;
  const bridge = pt(168)!;

  if (!product) {
    return (
      <div dir="ltr" className="min-h-screen bg-[#111] p-6 font-mono text-sm text-white/70">
        No products yet — add one in data/products.ts or via /admin, then reload.
      </div>
    );
  }

  return (
    <div dir="ltr" className="min-h-screen bg-[#111] p-6 text-white">
      <h1 className="mb-1 font-mono text-lg font-bold">Try-on geometry harness</h1>
      <p className="mb-5 font-mono text-xs text-white/50">
        Synthetic landmarks → computeFacePose → computeOverlayPlacement → GlassesOverlay
      </p>

      <div className="flex flex-wrap gap-8">
        <div
          className="relative shrink-0 overflow-hidden rounded-xl bg-[#1c1c1c]"
          style={{ width: VIDEO_W, height: VIDEO_H }}
        >
          {/* The live try-on mirrors the whole stage for a selfie view, so left
              and right are swapped on screen. Mirroring here too is what makes
              a turn look the same way round as it does on a real camera. */}
          <div
            className="absolute inset-0"
            style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
          >
          {/* Synthetic face drawn from the SAME landmarks fed to the pipeline */}
          <svg width={VIDEO_W} height={VIDEO_H} className="absolute inset-0">
            <ellipse
              cx={(templeL.x + templeR.x) / 2}
              cy={(forehead.y + chin.y) / 2}
              rx={Math.abs(templeR.x - templeL.x) / 2}
              ry={Math.abs(chin.y - forehead.y) / 2}
              fill="#3a3a3a"
              stroke="#555"
            />
            {eyeL && <ellipse cx={eyeL.x} cy={eyeL.y} rx={16} ry={9} fill="#fff" />}
            {eyeR && <ellipse cx={eyeR.x} cy={eyeR.y} rx={16} ry={9} fill="#fff" />}
            {eyeL && <circle cx={eyeL.x} cy={eyeL.y} r={5} fill="#222" />}
            {eyeR && <circle cx={eyeR.x} cy={eyeR.y} r={5} fill="#222" />}
            <circle cx={bridge.x} cy={bridge.y} r={4} fill="#f5c451" />
            <circle cx={templeL.x} cy={templeL.y} r={4} fill="#5ac8fa" />
            <circle cx={templeR.x} cy={templeR.y} r={4} fill="#5ac8fa" />
            <circle cx={forehead.x} cy={forehead.y} r={4} fill="#ff6b6b" />
            <circle cx={chin.x} cy={chin.y} r={4} fill="#ff6b6b" />
          </svg>

          {render3d ? (
            <GlassesOverlay3D
              ref={overlay3dRef}
              product={product}
              rect={{ left: 0, top: 0, width: VIDEO_W, height: VIDEO_H }}
            />
          ) : (
            <GlassesOverlay
              product={product}
              placement={placement}
              sideSrc={sideOverlay?.src}
              sidePlacement={sideOverlay?.placement}
              earClipPath={earClipToCssPath(earClip)}
            />
          )}
          </div>
        </div>

        <div className="min-w-[320px] font-mono text-xs">
          <label className="mb-3 block">
            product
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 block w-full rounded bg-white/10 p-2"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} — {p.name} ({p.tryOn.frameShape})
                </option>
              ))}
            </select>
          </label>

          <Slider label="yaw (input)" value={yawDeg} min={-50} max={50} onChange={setYawDeg} />
          <Slider label="roll (input)" value={rollDeg} min={-40} max={40} onChange={setRollDeg} />
          <Slider label="pitch (input, head tilt)" value={pitchDeg} min={-60} max={60} onChange={setPitchDeg} />
          <Slider label="head half-width px" value={headHalfWidthPx} min={50} max={200} onChange={setHeadHalfWidthPx} />

          <label className="mb-2 flex items-center gap-2">
            <input type="checkbox" checked={showIris} onChange={(e) => setShowIris(e.target.checked)} />
            iris landmarks available
          </label>

          <label className="mb-2 flex items-center gap-2">
            <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} />
            mirrored (as the customer sees it)
          </label>

          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" checked={render3d} onChange={(e) => setRender3d(e.target.checked)} />
            render in 3D (GLB / placeholder mesh + head mask)
          </label>

          <pre className="whitespace-pre-wrap rounded bg-white/10 p-3 leading-5">
{pose
  ? [
      `pose.roll   = ${pose.roll.toFixed(1)}°   (input ${rollDeg}°)`,
      `pose.yaw    = ${pose.yaw.toFixed(1)}°   (input ${yawDeg}°)`,
      `pose.pitch  = ${pose.pitch.toFixed(1)}°`,
      `pose.width  = ${pose.width.toFixed(1)}px`,
      `anchor      = ${pose.anchorX.toFixed(1)}, ${pose.anchorY.toFixed(1)}`,
      `bridge lm   = ${bridge.x.toFixed(1)}, ${bridge.y.toFixed(1)}`,
      "",
      placement
        ? [
            `place.left  = ${placement.leftPx.toFixed(1)}`,
            `place.top   = ${placement.topPx.toFixed(1)}`,
            `place.width = ${placement.widthPx.toFixed(1)}`,
            `transform   = ${overlayTransform(placement)}`,
          ].join("\n")
        : "placement = NULL",
    ].join("\n")
  : "pose = NULL"}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-3 block">
      {label}: <span className="text-[#f5c451]">{value}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full"
      />
    </label>
  );
}
