"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LENS_DETECTION_TRUSTED, type LensConfiguration, type LensMode } from "@/data/products";
import type { LensAnalysis } from "@/lib/threeTryOn/lensGeometry";
import type { DetectedLensColor } from "@/lib/lensColorDetection";
import { fileToResizedDataUrl } from "@/lib/imageResize";

/**
 * The admin's view of the lens pipeline for a generated model: what colour
 * the real product's lens is (read from its photo), which of the three lens
 * modes to use, and what each one actually looks like — rendered from the
 * processed model itself, over a face, so "can the eyes be seen through it"
 * is answered by looking rather than by trusting a number.
 */

const MODES: { value: LensMode; label: string; hint: string }[] = [
  { value: "original", label: "اللون الأصلي", hint: "عدسة شفافة بلون عدسة المنتج الحقيقي" },
  { value: "clear", label: "شفافة", hint: "بلا لون، مجرد لمعة خفيفة" },
  { value: "none", label: "بدون عدسة", hint: "إطار مفتوح" },
];

const SOURCE_LABEL = { photo: "من صورة المنتج", "model-texture": "من خامة المجسم المولَّد" } as const;

/** Model-render detection can only ever be a hint: the generator's lens colour is the thing in doubt. */
const MODEL_RENDER_MAX_CONFIDENCE = 0.55;
/** Longest side of a preview render; small keeps the three of them quick. */
const PREVIEW_WIDTH = 520;
/** Geometry confidence below which the model is left untouched (mirrors lensGeometry). */
const GEOMETRY_TRUSTED = 0.5;

interface Preview {
  dataUrl: string;
  geometry: { aspect: number; lensLeftX: number; lensRightX: number; lensY: number };
}

export function LensProcessingPanel({
  modelUrl,
  modelReady,
  lens,
  onLensChange,
  sourcePhoto,
  onSourcePhoto,
  onError,
}: {
  modelUrl: string;
  modelReady: boolean;
  lens: LensConfiguration;
  onLensChange: (lens: LensConfiguration) => void;
  /** The product's own front photo, if it has one — the colour source. */
  sourcePhoto: string | null;
  onSourcePhoto: (dataUrl: string) => void;
  onError: (text: string) => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [detection, setDetection] = useState<DetectedLensColor | null>(null);
  const [analysis, setAnalysis] = useState<LensAnalysis | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<LensMode, Preview>>>({});
  const photoRef = useRef<HTMLInputElement>(null);
  const pendingPhotoDetect = useRef(false);
  const lensRef = useRef(lens);
  useEffect(() => {
    lensRef.current = lens;
  }, [lens]);

  const trusted = (lens.detectionConfidence ?? 0) >= LENS_DETECTION_TRUSTED;

  /**
   * Runs the colour detection: on the product photo when there is one, else
   * on a front-on render of the raw model (the generator's own idea of the
   * lens — usable, but capped below "trusted" so it is offered, not applied).
   */
  const detect = useCallback(async (): Promise<LensConfiguration | undefined> => {
    if (!modelUrl) return undefined;
    setDetecting(true);
    try {
      const { detectLensColorFromImage } = await import("@/lib/lensColorDetection");
      let result: DetectedLensColor;
      let source: LensConfiguration["detectionSource"];
      if (sourcePhoto) {
        result = await detectLensColorFromImage(sourcePhoto);
        source = "photo";
      } else {
        const { renderModelThumbnail } = await import("@/lib/threeTryOn/renderModelThumbnail");
        const raw = await renderModelThumbnail(modelUrl, { maxWidth: 800 });
        result = await detectLensColorFromImage(raw.dataUrl);
        result = { ...result, confidence: Math.min(result.confidence, MODEL_RENDER_MAX_CONFIDENCE) };
        source = "model-texture";
      }
      setDetection(result);
      const detectedColor = result.kind === "clear" ? "#ffffff" : result.color;
      const detectedTint = result.kind === "clear" ? 0.06 : result.tintStrength;
      const apply = result.confidence >= LENS_DETECTION_TRUSTED;
      const next: LensConfiguration = {
        ...lensRef.current,
        detectedColor,
        detectedTintStrength: detectedTint,
        detectionConfidence: result.confidence,
        detectionSource: source,
        ...(apply ? { color: detectedColor, tintStrength: detectedTint } : {}),
      };
      lensRef.current = next;
      onLensChange(next);
      return next;
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذّر كشف لون العدسة.");
      return undefined;
    } finally {
      setDetecting(false);
    }
  }, [modelUrl, sourcePhoto, onLensChange, onError]);

  /** Renders the three modes from the actual processed model. */
  const renderPreviews = useCallback(async (config?: LensConfiguration) => {
    if (!modelUrl) return;
    setRendering(true);
    try {
      const { renderModelThumbnail } = await import("@/lib/threeTryOn/renderModelThumbnail");
      const current = config ?? lensRef.current;
      const next: Partial<Record<LensMode, Preview>> = {};
      let found: LensAnalysis | null = null;
      for (const mode of ["original", "clear", "none"] as LensMode[]) {
        const shot = await renderModelThumbnail(modelUrl, {
          lens: { ...current, mode },
          maxWidth: PREVIEW_WIDTH,
        });
        next[mode] = { dataUrl: shot.dataUrl, geometry: shot.geometry };
        if (shot.lens) found = shot.lens.analysis;
      }
      setPreviews(next);
      setAnalysis(found);
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذّر توليد معاينة العدسات.");
    } finally {
      setRendering(false);
    }
  }, [modelUrl, onError]);

  // First time a model resolves with nothing detected yet: detect, then show.
  const autoRanFor = useRef<string | null>(null);
  useEffect(() => {
    if (!modelReady || !modelUrl || autoRanFor.current === modelUrl) return;
    autoRanFor.current = modelUrl;
    const run = async () => {
      const detected = lensRef.current.detectionConfidence === undefined ? await detect() : undefined;
      await renderPreviews(detected);
    };
    void run();
  }, [modelReady, modelUrl, detect, renderPreviews]);

  // The tinted preview follows the colour controls, a beat behind the slider.
  const colorKey = `${lens.color ?? ""}|${lens.tintStrength ?? ""}`;
  const firstColorKey = useRef(colorKey);
  useEffect(() => {
    if (!modelReady || !modelUrl || firstColorKey.current === colorKey) return;
    firstColorKey.current = colorKey;
    const timer = setTimeout(() => void renderPreviews(), 500);
    return () => clearTimeout(timer);
  }, [colorKey, modelReady, modelUrl, renderPreviews]);

  const handlePhoto = async (file: File) => {
    try {
      const dataUrl = await fileToResizedDataUrl(file, 1200);
      onSourcePhoto(dataUrl);
      // Detection runs against the new photo on the next render, once the
      // prop has caught up — kicked from the effect below.
      pendingPhotoDetect.current = true;
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذّر قراءة الصورة.");
    } finally {
      if (photoRef.current) photoRef.current.value = "";
    }
  };
  useEffect(() => {
    if (!pendingPhotoDetect.current || !sourcePhoto) return;
    pendingPhotoDetect.current = false;
    void detect().then((next) => renderPreviews(next));
  }, [sourcePhoto, detect, renderPreviews]);

  const reprocess = async () => {
    const next = await detect();
    await renderPreviews(next);
  };

  if (!modelUrl) return null;

  const geometryUntrusted = analysis !== null && (!analysis.found || analysis.confidence < GEOMETRY_TRUSTED);

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4">
      <h4 className="text-sm font-bold text-ink">معالجة العدسات</h4>
      <p className="mt-1 text-[11px] leading-5 text-muted">
        المجسم المولَّد يأتي بعدسة معتمة أو بلون غير دقيق. تُزال هذه العدسة تلقائياً ويُستبدل بها ما تختاره هنا،
        واللون يُقرأ من صورة المنتج الحقيقية لا من المجسم.
      </p>

      {/* ---- Colour source ---- */}
      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex items-start gap-3">
          {sourcePhoto ? (
            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sourcePhoto} alt="" className="h-full w-full object-contain" />
              {detection?.analysed && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${detection.analysed.width} ${detection.analysed.height}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {[detection.regions.left, detection.regions.right].map(
                    (r, i) =>
                      r && <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#22c55e" strokeWidth={4} />
                  )}
                </svg>
              )}
            </div>
          ) : (
            <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-center text-[10px] leading-4 text-muted">
              لا توجد صورة للمنتج
            </div>
          )}
        </div>
        <div className="text-[11px] leading-5 text-muted">
          <p className="font-bold text-ink-soft">صورة المنتج الأصلية</p>
          <p>
            الصورة نفسها التي أُرسلت إلى Hyper3D. تُحفظ ضمن معرض صور المنتج ويُقرأ منها لون العدسة.
            {!sourcePhoto && " بدونها يُقرأ اللون من المجسم كتخمين فقط."}
          </p>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
            className="mt-1.5 block w-full text-xs text-ink-soft file:me-2 file:rounded-full file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
          />
        </div>
      </div>

      {/* ---- Detected colour ---- */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <span
          className="h-9 w-9 shrink-0 rounded-lg border border-line"
          style={{ background: lens.detectedColor ?? "transparent" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 text-[11px] leading-5">
          {lens.detectionConfidence === undefined ? (
            <p className="text-muted">{detecting ? "جاري كشف لون العدسة…" : "لم يُكشف اللون بعد."}</p>
          ) : (
            <>
              <p className="font-bold text-ink">
                اللون المكتشف: <span dir="ltr" className="font-mono">{lens.detectedColor}</span>
                {detection?.kind === "clear" && <span className="ms-2 text-muted">(عدسة شفافة)</span>}
              </p>
              <p className={trusted ? "text-accent" : "text-danger"}>
                الثقة {Math.round((lens.detectionConfidence ?? 0) * 100)}٪
                {lens.detectionSource && ` — ${SOURCE_LABEL[lens.detectionSource]}`}
                {!trusted && " — غير موثوق، اختر اللون يدوياً أو ارفع صورة المنتج"}
              </p>
              {detection?.reasons.length ? (
                <details className="text-muted">
                  <summary className="cursor-pointer">التفاصيل</summary>
                  <ul dir="ltr" className="mt-1 list-disc ps-4 text-left font-mono text-[10px] leading-4">
                    {detection.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!trusted && lens.detectedColor && (
            <button
              type="button"
              onClick={() => onLensChange({ ...lens, color: lens.detectedColor, tintStrength: lens.detectedTintStrength })}
              className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink"
            >
              اعتماد اللون المكتشف
            </button>
          )}
          <button
            type="button"
            onClick={reprocess}
            disabled={detecting || rendering || !modelReady}
            className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink disabled:opacity-50"
          >
            {detecting ? "جاري المعالجة…" : "إعادة معالجة العدسة"}
          </button>
        </div>
      </div>

      {/* ---- Mode ---- */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition ${
              lens.mode === m.value ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-accent/40"
            }`}
          >
            <input
              type="radio"
              name="lens-mode"
              checked={lens.mode === m.value}
              onChange={() => onLensChange({ ...lens, mode: m.value })}
              className="mt-0.5"
            />
            <span className="text-xs leading-5">
              <span className="block font-bold text-ink">{m.label}</span>
              <span className="text-muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {lens.mode === "original" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-soft">لون العدسة المعروض</span>
            <input
              type="color"
              value={lens.color ?? "#ffffff"}
              onChange={(e) => onLensChange({ ...lens, color: e.target.value })}
              className="field h-11 w-full cursor-pointer p-1"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink-soft">
              شدّة اللون: {Math.round((lens.tintStrength ?? 0.15) * 100)}٪
            </span>
            <input
              type="range"
              min={0.04}
              max={0.4}
              step={0.01}
              value={lens.tintStrength ?? 0.15}
              onChange={(e) => onLensChange({ ...lens, tintStrength: Number(e.target.value) })}
              className="mt-3 w-full"
            />
          </label>
        </div>
      )}

      {/* ---- Previews over a face ---- */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink-soft">معاينة الأوضاع الثلاثة على وجه</p>
          {rendering && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              جاري التوليد…
            </span>
          )}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onLensChange({ ...lens, mode: m.value })}
              className={`overflow-hidden rounded-xl border text-start transition ${
                lens.mode === m.value ? "border-accent" : "border-line hover:border-accent/40"
              }`}
            >
              <FacePreview preview={previews[m.value] ?? null} />
              <span className="block px-2 py-1.5 text-[11px] font-bold text-ink">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- Geometry report ---- */}
      {analysis && (
        <div className={`mt-3 rounded-xl border p-3 text-[11px] leading-5 ${geometryUntrusted ? "border-danger/40 bg-danger/5" : "border-line bg-surface"}`}>
          <p className="font-bold text-ink">
            {analysis.found
              ? `تم التعرف على عدسة المجسم — الثقة ${Math.round(analysis.confidence * 100)}٪ (${analysis.lensFaces.toLocaleString()} وجهاً من ${analysis.totalFaces.toLocaleString()})`
              : "لم يُعثر على عدسة في المجسم"}
          </p>
          {geometryUntrusted && (
            <p className="text-danger">
              {analysis.found
                ? "الثقة منخفضة، لذا يُعرض المجسم كما هو دون تعديل حتى لا تُحذف أجزاء من الإطار."
                : "الإطار مفتوح أصلاً أو المجسم غير موجّه للأمام؛ لا شيء يُزال."}
            </p>
          )}
          <ul dir="ltr" className="mt-1 list-disc ps-4 text-left font-mono text-[10px] leading-4 text-muted">
            {analysis.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * A rendered frame over a plain face: skin, and an eye under each lens centre
 * the renderer reported. If the eyes read through, the lens is doing its job.
 */
function FacePreview({ preview }: { preview: Preview | null }) {
  if (!preview) {
    return <div className="aspect-[2/1] w-full animate-pulse bg-surface-3" />;
  }
  const { lensLeftX, lensRightX, lensY, aspect } = preview.geometry;
  const W = 200;
  const H = W / aspect;
  const span = (lensRightX - lensLeftX) * W;
  const eyeRx = span * 0.14;
  const eyeRy = eyeRx * 0.55;
  return (
    <div className="relative w-full" style={{ aspectRatio: `${aspect}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <rect width={W} height={H} fill="#d8a985" />
        {[lensLeftX, lensRightX].map((x, i) => (
          <g key={i}>
            <ellipse cx={x * W} cy={lensY * H} rx={eyeRx} ry={eyeRy} fill="#fff" />
            <circle cx={x * W} cy={lensY * H} r={eyeRy * 0.7} fill="#5b3a1e" />
            <circle cx={x * W} cy={lensY * H} r={eyeRy * 0.35} fill="#111" />
          </g>
        ))}
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.dataUrl} alt="" className="absolute inset-0 h-full w-full" />
    </div>
  );
}
