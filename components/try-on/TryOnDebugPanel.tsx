"use client";

import { useEffect, useRef } from "react";
import type { TryOnDebugInfo } from "@/lib/threeTryOn/tryOnScene";

/**
 * Live readout and session report for judging the 3D fit on a real camera.
 * Development only — mounted next to `TryOnDebugOverlay` when `?tryOnDebug=1`
 * is on, never otherwise.
 *
 * It is not mirrored with the camera (so the text reads normally) and it is
 * interactive: it shows what the calibration currently rests on and how stable
 * the result is, and can copy a compact numbers-only report of the session.
 */

interface Sample {
  t: number;
  vis: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  dist: number;
  state: string;
  conf: number;
  basis: string;
  rel: boolean;
  spanRaw: number;
  span: number;
  frame: number;
  faceW: number;
}

const WINDOW_MS = 5000;
const KEEP_MS = 120_000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

export function TryOnDebugPanel({ getInfo }: { getInfo: () => TryOnDebugInfo | null }) {
  const textRef = useRef<HTMLPreElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const samples = useRef<Sample[]>([]);
  const session = useRef({
    start: 0,
    lostSince: null as number | null,
    losses: [] as { at: number; seconds: number }[],
    jumps: 0,
    lastFrame: 0,
    lastSpanRaw: NaN,
    events: [] as { t: number; what: string }[],
    lastState: "",
  });

  const reset = () => {
    samples.current = [];
    const s = session.current;
    s.start = performance.now();
    s.lostSince = null;
    s.losses = [];
    s.jumps = 0;
    s.lastFrame = 0;
    s.events = [];
    s.lastState = "";
  };

  const windowStats = () => {
    const now = performance.now();
    const win = samples.current.filter((s) => now - s.t <= WINDOW_MS);
    const vis = win.filter((s) => s.vis);
    let maxStep = 0;
    for (let i = 1; i < vis.length; i++) {
      maxStep = Math.max(maxStep, Math.abs(vis[i].frame - vis[i - 1].frame) / Math.max(1e-6, vis[i - 1].frame));
    }
    const frames = vis.map((s) => s.frame);
    const range = frames.length ? (Math.max(...frames) - Math.min(...frames)) / Math.max(1e-6, median(frames)) : 0;
    let det = 0;
    for (let i = 1; i < vis.length; i++) if (vis[i].spanRaw !== vis[i - 1].spanRaw) det++;
    const seconds = win.length > 1 ? (win[win.length - 1].t - win[0].t) / 1000 : 0;
    const reliableSpans = vis.filter((s) => s.rel).map((s) => s.spanRaw);
    return {
      trackedPct: win.length ? (vis.length / win.length) * 100 : 0,
      range,
      maxStep,
      detectionsPerSec: seconds > 0 ? det / seconds : 0,
      frontalSpan: median(reliableSpans),
      frontalFrames: reliableSpans.length,
    };
  };

  useEffect(() => {
    session.current.start = performance.now();
    let raf = 0;
    let lastPaint = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const info = getInfo();
      const s = session.current;
      const vis = !!info?.visible;
      if (info) {
        samples.current.push({
          t: now,
          vis,
          yaw: info.yawDeg,
          pitch: info.pitchDeg,
          roll: info.rollDeg,
          dist: info.distanceCm,
          state: info.calibrationState,
          conf: info.calibrationConfidence,
          basis: info.calibrationBasis,
          rel: info.frameReliable,
          spanRaw: info.lensSpanRawCm,
          span: info.lensSpanCm,
          frame: info.frameWidthCm,
          faceW: info.faceWidthCm,
        });
        while (samples.current.length && now - samples.current[0].t > KEEP_MS) samples.current.shift();
        if (vis) {
          if (s.lastFrame > 0 && Math.abs(info.frameWidthCm - s.lastFrame) / s.lastFrame > 0.03) s.jumps++;
          s.lastFrame = info.frameWidthCm;
          const key = `${info.calibrationState}/${info.calibrationBasis}`;
          if (key !== s.lastState) {
            s.events.push({
              t: r2((now - s.start) / 1000),
              what: `${key} @yaw ${Math.round(info.yawDeg)}°, ${Math.round(info.calibrationConfidence * 100)}%`,
            });
            s.lastState = key;
          }
        }
      }
      // Loss / recovery bookkeeping.
      if (!vis && s.lostSince === null && samples.current.length > 1) s.lostSince = now;
      if (vis && s.lostSince !== null) {
        const seconds = (now - s.lostSince) / 1000;
        if (seconds > 0.15) s.losses.push({ at: r2((s.lostSince - s.start) / 1000), seconds: r2(seconds) });
        s.events.push({ t: r2((now - s.start) / 1000), what: `face back after ${seconds.toFixed(2)} s` });
        s.lostSince = null;
      }
      if (s.events.length > 80) s.events.splice(0, s.events.length - 80);

      if (now - lastPaint < 250 || !textRef.current) return;
      lastPaint = now;
      const w = windowStats();
      const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
      const el = textRef.current;
      if (!info || !vis) {
        el.textContent = `NO FACE\nlost ${s.losses.length}x so far · tracked ${w.trackedPct.toFixed(0)}% of the last 5 s`;
        el.style.borderColor = "#94a3b8";
        return;
      }
      const calibrated = info.calibrationState === "calibrated";
      const bar = "█".repeat(Math.round(info.calibrationConfidence * 10)).padEnd(10, "░");
      const frontalNote = Number.isFinite(w.frontalSpan)
        ? `facing-camera frames, last 5 s: median ${w.frontalSpan.toFixed(2)} cm over ${w.frontalFrames} frames`
        : "facing-camera frames, last 5 s: none (turn to face the camera)";
      el.style.borderColor = calibrated ? "#22c55e" : info.calibrationState === "provisional" ? "#f59e0b" : "#94a3b8";
      el.textContent = [
        calibrated
          ? "FIT: CALIBRATED (based on facing-camera frames)"
          : info.calibrationState === "provisional"
            ? `FIT: PROVISIONAL (${info.calibrationBasis === "turned" ? "turned-head data only, reads too small; face the camera" : "collecting facing-camera frames"})`
            : "FIT: SEARCHING",
        `confidence ${bar} ${Math.round(info.calibrationConfidence * 100)}%   this frame: ${info.frameReliable ? "RELIABLE" : "not reliable (turned or moving)"}`,
        `pupil span  this frame ${info.lensSpanRawCm.toFixed(2)} cm   applied ${info.lensSpanCm.toFixed(2)} cm`,
        frontalNote,
        `glasses width ${info.frameWidthCm.toFixed(1)} cm (applied)   face width ${info.faceWidthCm.toFixed(1)} cm   distance ${info.distanceCm.toFixed(0)} cm`,
        `pose yaw ${info.yawDeg.toFixed(0)}°  pitch ${info.pitchDeg.toFixed(0)}°  roll ${info.rollDeg.toFixed(0)}°`,
        `last 5 s: tracked ${w.trackedPct.toFixed(0)}% · glasses-width range ${pct(w.range)} · biggest 1-frame step ${pct(w.maxStep)} · ${w.detectionsPerSec.toFixed(0)} detections/s`,
        `session ${((now - s.start) / 1000).toFixed(0)} s: lost ${s.losses.length}x (longest ${s.losses.length ? Math.max(...s.losses.map((l) => l.seconds)).toFixed(1) : "0"} s) · width jumps over 3% in one frame: ${s.jumps}`,
      ].join("\n");
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getInfo]);

  const buildReport = () => {
    const now = performance.now();
    const s = session.current;
    const all = samples.current;
    // One row per second over the last 90 s: enough to see the story, small enough to paste.
    const timeline: Record<string, number | string | boolean>[] = [];
    let next = -Infinity;
    for (const x of all) {
      if (now - x.t > 90_000 || x.t < next) continue;
      next = x.t + 1000;
      timeline.push({
        t: r2((x.t - s.start) / 1000),
        vis: x.vis,
        yaw: Math.round(x.yaw),
        pitch: Math.round(x.pitch),
        roll: Math.round(x.roll),
        dist: Math.round(x.dist),
        state: x.state,
        conf: r2(x.conf),
        basis: x.basis,
        rel: x.rel,
        spanRaw: r2(x.spanRaw),
        span: r2(x.span),
        frame: r2(x.frame),
      });
    }
    const w = windowStats();
    const vis = all.filter((x) => x.vis);
    const frames = vis.map((x) => x.frame);
    const reliable = vis.filter((x) => x.rel).map((x) => x.spanRaw);
    return {
      note: "try-on debug session report (numbers only, no images)",
      sessionSeconds: r2((now - s.start) / 1000),
      samplesKept: all.length,
      trackedPct: r2(all.length ? (vis.length / all.length) * 100 : 0),
      losses: s.losses,
      widthJumpsOver3pct: s.jumps,
      glassesWidthCm: frames.length ? { min: r2(Math.min(...frames)), median: r2(median(frames)), max: r2(Math.max(...frames)) } : null,
      facingCameraPupilSpanCm: reliable.length ? { frames: reliable.length, median: r2(median(reliable)) } : null,
      appliedPupilSpanCm: vis.length ? r2(vis[vis.length - 1].span) : null,
      last5s: {
        trackedPct: r2(w.trackedPct),
        widthRangePct: r2(w.range * 100),
        biggestStepPct: r2(w.maxStep * 100),
        detectionsPerSec: r2(w.detectionsPerSec),
      },
      events: s.events,
      timeline1Hz: timeline,
    };
  };

  const copy = async () => {
    const json = JSON.stringify(buildReport());
    (window as unknown as { __tryOnReport?: () => string }).__tryOnReport = () => JSON.stringify(buildReport());
    let ok = false;
    try {
      await navigator.clipboard.writeText(json);
      ok = true;
    } catch {
      // Clipboard blocked: fall back to a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (noteRef.current) {
      noteRef.current.textContent = ok
        ? `copied ${json.length} chars, paste it into the chat`
        : "copy failed: run copy(__tryOnReport()) in the console";
    }
  };

  return (
    <div data-debug-overlay dir="ltr" className="absolute bottom-2 left-2 right-2 z-20 max-w-[34rem] font-mono text-[10px] leading-4 text-white">
      <pre ref={textRef} className="pointer-events-none whitespace-pre-wrap rounded-lg border-2 border-slate-400 bg-black/80 p-2 text-left" />
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={copy} className="rounded-md bg-sky-500 px-2 py-1 font-bold text-black">
          Copy report
        </button>
        <button type="button" onClick={reset} className="rounded-md bg-white/80 px-2 py-1 font-bold text-black">
          Reset stats
        </button>
        <span ref={noteRef} className="rounded bg-black/70 px-1 text-amber-300" />
      </div>
    </div>
  );
}
