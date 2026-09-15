"use client";

import { useEffect, useRef } from "react";
import type { OverlayRect } from "@/components/try-on/GlassesOverlay3D";
import type { TryOnDebugInfo } from "@/lib/threeTryOn/tryOnScene";
import { LM } from "@/lib/threeTryOn/headFrame";

/**
 * Development-only view of the 3D fit: the landmarks the head frame is built
 * from, the head's axes, the anchor, and the numbers behind them — drawn over
 * the live camera so the maths can be checked against a real face.
 *
 * Turned on with `?tryOnDebug=1` on any page, or
 * `localStorage.setItem("tryOnDebug", "1")`. Never mounted otherwise.
 */
export function isTryOnDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("tryOnDebug") === "1") return true;
    return window.localStorage.getItem("tryOnDebug") === "1";
  } catch {
    return false;
  }
}

const LANDMARK_LABEL: Record<number, string> = {
  [LM.noseBridge]: "168",
  [LM.noseTop]: "6",
  [LM.leftEyeOuter]: "33",
  [LM.rightEyeOuter]: "263",
  [LM.leftTemple]: "234",
  [LM.rightTemple]: "454",
};

export function TryOnDebugOverlay({
  rect,
  getInfo,
}: {
  /** The rectangle the camera feed covers, in CSS pixels — same as the 3D canvas. */
  rect: OverlayRect | null;
  getInfo: () => TryOnDebugInfo | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rect) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    let raf = 0;

    const dot = (u: number, v: number, colour: string, label?: string) => {
      const x = u * rect.width;
      const y = v * rect.height;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (label) {
        // The stage is mirrored; flip the text back so it reads normally.
        ctx.save();
        ctx.translate(x + 6, y - 6);
        ctx.scale(-1, 1);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    };
    const line = (a: { u: number; v: number }, b: { u: number; v: number }, colour: string) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.u * rect.width, a.v * rect.height);
      ctx.lineTo(b.u * rect.width, b.v * rect.height);
      ctx.stroke();
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const info = getInfo();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!info || !info.visible) {
        if (textRef.current) textRef.current.textContent = "no face";
        return;
      }
      ctx.font = "bold 11px ui-monospace, monospace";
      for (const [index, point] of Object.entries(info.landmarks)) {
        dot(point.u, point.v, "#38bdf8", LANDMARK_LABEL[Number(index)]);
      }
      dot(info.faceCentre.u, info.faceCentre.v, "#f472b6", "face");
      dot(info.eyeCentre.u, info.eyeCentre.v, "#a3e635", "eyes");
      dot(info.anchor.u, info.anchor.v, "#fbbf24", "anchor");
      line(info.anchor, info.axisRight, "#ef4444");
      line(info.anchor, info.axisUp, "#22c55e");
      line(info.anchor, info.axisForward, "#3b82f6");

      if (textRef.current) {
        const [px, py, pz] = info.position;
        const [rx, ry, rz] = info.rotationDeg;
        textRef.current.textContent = [
          `yaw ${info.yawDeg.toFixed(1)}°  pitch ${info.pitchDeg.toFixed(1)}°  roll ${info.rollDeg.toFixed(1)}°`,
          `IPD(outer) ${info.ipdCm.toFixed(1)} cm  lens span ${info.lensSpanCm.toFixed(2)} cm  ${info.calibrated ? "calibrated" : "calibrating…"}`,
          `frame width ${info.frameWidthCm.toFixed(1)} cm  face width ${info.faceWidthCm.toFixed(1)} cm  distance ${info.distanceCm.toFixed(0)} cm`,
          `model scale ${info.modelScale.toFixed(4)}`,
          `position ${px.toFixed(1)}, ${py.toFixed(1)}, ${pz.toFixed(1)} cm`,
          `rotation x ${rx.toFixed(1)}  y ${ry.toFixed(1)}  z ${rz.toFixed(1)}`,
          "axes: red = head right, green = up, blue = forward",
        ].join("\n");
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [rect, getInfo]);

  if (!rect) return null;
  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      />
      {/* Counter-mirrored so the numbers read left to right. */}
      <pre
        ref={textRef}
        dir="ltr"
        className="pointer-events-none absolute left-2 top-2 rounded-lg bg-black/70 p-2 text-left font-mono text-[10px] leading-4 text-white"
        style={{ transform: "scaleX(-1)", transformOrigin: "center" }}
      />
    </>
  );
}
