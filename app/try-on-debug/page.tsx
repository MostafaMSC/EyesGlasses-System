"use client";

/**
 * Development harness for the try-on geometry (not linked from the site).
 *
 * Feeds a synthetic, parametric face through the real
 * computeFacePose -> computeOverlayPlacement -> GlassesOverlay pipeline so the
 * placement math can be verified without a camera, and per-product offsets can
 * be tuned. Visit /try-on-debug.
 */

import { useMemo, useState } from "react";
import { useProductStore } from "@/lib/productStore";
import { computeFacePose, PitchCalibrator, type NormalizedPoint } from "@/lib/faceGeometry";
import { computeOverlayPlacement, overlayTransform } from "@/lib/overlayPlacement";
import { GlassesOverlay } from "@/components/try-on/GlassesOverlay";

const VIDEO_W = 640;
const VIDEO_H = 480;

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
  headHalfWidthPx: number;
  centerX: number;
  centerY: number;
}): NormalizedPoint[] {
  const { yawDeg, rollDeg, headHalfWidthPx, centerX, centerY } = opts;
  const yaw = (yawDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;

  const landmarks: NormalizedPoint[] = [];
  for (const [indexStr, [x, y, z]] of Object.entries(HEAD_MODEL)) {
    // Rotate about the vertical axis (yaw), then project orthographically.
    const xr = x * Math.cos(yaw) + z * Math.sin(yaw);
    // Scale to pixels, then apply in-plane roll.
    const px = xr * headHalfWidthPx;
    const py = y * headHalfWidthPx;
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
  const [headHalfWidthPx, setHeadHalfWidthPx] = useState(110);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [showIris, setShowIris] = useState(true);

  // Falls back if the selected product was deleted from the admin panel.
  const product = products.find((p) => p.id === productId) ?? products[0];

  const { landmarks, pose, placement } = useMemo(() => {
    const lm = buildSyntheticLandmarks({
      yawDeg,
      rollDeg,
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

    const p = computeFacePose(lm, VIDEO_W, VIDEO_H, calibrator);
    const pl = p && product
      ? computeOverlayPlacement(
          p,
          product.tryOn,
          { videoWidth: VIDEO_W, videoHeight: VIDEO_H },
          { width: VIDEO_W, height: VIDEO_H }
        )
      : null;
    return { landmarks: lm, pose: p, placement: pl };
  }, [yawDeg, rollDeg, headHalfWidthPx, product, showIris]);

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

          <GlassesOverlay product={product} placement={placement} />
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
          <Slider label="head half-width px" value={headHalfWidthPx} min={50} max={200} onChange={setHeadHalfWidthPx} />

          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" checked={showIris} onChange={(e) => setShowIris(e.target.checked)} />
            iris landmarks available
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
