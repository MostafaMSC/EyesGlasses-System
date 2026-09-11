"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useShopUI } from "@/context/ShopUIContext";
import { getProductVisualSrc, type TryOnConfig } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { useFaceLandmarker } from "@/lib/useFaceLandmarker";
import { useElementSize } from "@/lib/useElementSize";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import {
  computeFacePose,
  FacePoseSmoother,
  PitchCalibrator,
  type FacePose,
  type NormalizedPoint,
} from "@/lib/faceGeometry";
import {
  computeCoverTransform,
  computeOverlayPlacement,
  DEFAULT_OVERLAY_GEOMETRY,
  selectSideOverlay,
  type OverlayPlacement,
  type SideOverlaySelection,
} from "@/lib/overlayPlacement";
import type { GlassesOverlay3DHandle, OverlayRect } from "@/components/try-on/GlassesOverlay3D";
// Type-only, so this never pulls Three.js into this module's bundle.
import type { MediapipeMatrix } from "@/lib/threeTryOn/faceMatrix";
import { loadImage } from "@/lib/loadImage";
import { CONTACT_SHADOW, edgeFade, maskedOverlayCanvas, sideBlendWeight } from "@/lib/overlayAppearance";
import { openWhatsAppOrder } from "@/lib/whatsapp";
import { GlassesOverlay } from "@/components/try-on/GlassesOverlay";
import { TryOnProductSelector } from "@/components/try-on/TryOnProductSelector";
import { CameraControls } from "@/components/try-on/CameraControls";
import { CapturePreview } from "@/components/try-on/CapturePreview";
import { IconClose } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";

/**
 * Three.js and the whole 3D stack are a few hundred KB — loaded only once
 * someone actually opens a 3D try-on, never on normal browsing, the same way
 * `useFaceLandmarker` defers the MediaPipe model. `ssr: false` because it
 * needs a real canvas and a WebGL context.
 */
const GlassesOverlay3D = dynamic(
  () => import("@/components/try-on/GlassesOverlay3D").then((m) => m.GlassesOverlay3D),
  { ssr: false }
);

type PermissionState = "idle" | "requesting" | "granted" | "denied" | "unavailable" | "unsupported";
type FaceState = "searching" | "tracking" | "multiple";

/**
 * A single frame with zero detected faces (motion blur, a hand crossing the
 * face, brief occlusion by the glasses already being tried on) is common and
 * shouldn't make the overlay vanish and snap back — that reads as jitter.
 * Only treat tracking as truly lost after it's been missing this long.
 */
const NO_FACE_GRACE_MS = 400;

/** Lens-centre span as a fraction of the generated frame artwork's width. */
const DEFAULT_LENS_SPAN_FRAC =
  DEFAULT_OVERLAY_GEOMETRY.lensRightX - DEFAULT_OVERLAY_GEOMETRY.lensLeftX;

/**
 * How many tracked frames may arrive without a head-pose matrix before 3D
 * gives up and hands back to the 2D overlay. The bundled face model does
 * produce one, so this only trips on an unexpected model/runtime — but
 * silently showing nothing would be a baffling way to fail.
 */
const MISSING_MATRIX_LIMIT = 30;

type RenderMode = "2d" | "3d";

/**
 * Draws one overlay image (front or side) into the capture canvas at the
 * given placement and opacity — shared so the front/side cross-fade in the
 * live preview (`GlassesOverlay`) is reproduced in the saved photo instead
 * of only ever capturing the front image.
 */
function drawOverlayImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  placement: OverlayPlacement,
  alpha: number
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(placement.leftPx + placement.widthPx / 2, placement.topPx + placement.heightPx / 2);
  ctx.rotate((placement.rollDeg * Math.PI) / 180);
  // Canvas 2D has no depth, so yaw and pitch are approximated by squeezing
  // the axis each one foreshortens.
  const yawSquash = Math.max(Math.cos((placement.yawDeg * Math.PI) / 180), 0.55);
  const pitchSquash = Math.max(Math.cos((placement.pitchDeg * Math.PI) / 180), 0.7);
  ctx.scale(yawSquash, pitchSquash);
  ctx.shadowColor = CONTACT_SHADOW.canvas.color;
  ctx.shadowBlur = CONTACT_SHADOW.canvas.blur;
  ctx.shadowOffsetY = CONTACT_SHADOW.canvas.offsetY;
  ctx.drawImage(image, -placement.widthPx / 2, -placement.heightPx / 2, placement.widthPx, placement.heightPx);
  ctx.restore();
}

export function VirtualTryOnModal() {
  const { tryOnProductId, closeTryOn, setTryOnProductId } = useShopUI();
  const { getById } = useProductStore();
  const isOpen = Boolean(tryOnProductId);
  const product = tryOnProductId ? getById(tryOnProductId) : undefined;

  useBodyScrollLock(isOpen);

  const { status: landmarkerStatus, detect } = useFaceLandmarker(isOpen);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const smootherRef = useRef(new FacePoseSmoother());
  const pitchCalibratorRef = useRef(new PitchCalibrator());
  const lastFaceSeenAtRef = useRef<number | null>(null);
  const productRef = useRef(product);
  const [stageRef, stageSize] = useElementSize<HTMLDivElement>();
  const stageSizeRef = useRef(stageSize);

  const overlay3dRef = useRef<GlassesOverlay3DHandle>(null);
  const missingMatrixCountRef = useRef(0);

  const [permission, setPermission] = useState<PermissionState>("idle");
  const [faceState, setFaceState] = useState<FaceState>("searching");
  const [placement, setPlacement] = useState<OverlayPlacement | null>(null);
  const [sideOverlay, setSideOverlay] = useState<SideOverlaySelection | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const videoSizeRef = useRef(videoSize);
  /** Null until the user picks a mode, so switching product keeps their choice. */
  const [chosenMode, setChosenMode] = useState<RenderMode | null>(null);
  /** Set when 3D gave up on its own, so the reason isn't invisible. */
  const [threeUnavailable, setThreeUnavailable] = useState(false);

  // A product with a real 3D model is best shown in 3D; a flat photo still
  // looks more like itself as a 2D cutout than as a generic placeholder mesh.
  const mode: RenderMode = chosenMode ?? (product?.tryOn.model3d ? "3d" : "2d");
  const is3d = mode === "3d";
  const modeRef = useRef(is3d);

  useEffect(() => {
    productRef.current = product;
  }, [product]);
  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);
  useEffect(() => {
    modeRef.current = is3d;
  }, [is3d]);

  /**
   * The rectangle the camera feed actually covers. `object-fit: cover` crops
   * it, so this is usually wider than the stage — the 3D canvas has to match
   * it exactly, or the render and the face drift apart.
   */
  const overlayRect = useMemo<OverlayRect | null>(() => {
    if (!videoSize.width || !videoSize.height || !stageSize.width || !stageSize.height) return null;
    const { scale, offsetX, offsetY } = computeCoverTransform(
      { videoWidth: videoSize.width, videoHeight: videoSize.height },
      stageSize
    );
    return {
      left: -offsetX,
      top: -offsetY,
      width: videoSize.width * scale,
      height: videoSize.height * scale,
    };
  }, [videoSize, stageSize]);

  const requestCamera = useCallback((onCancelledRef: { cancelled: boolean }) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      return;
    }
    setPermission("requesting");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (onCancelledRef.cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setPermission("granted");
      })
      .catch((err: DOMException) => {
        if (onCancelledRef.cancelled) return;
        setPermission(err.name === "NotAllowedError" || err.name === "PermissionDeniedError" ? "denied" : "unavailable");
      });
  }, []);

  // Camera lifecycle — request permission when the modal opens, always
  // release the stream when it closes.
  useEffect(() => {
    if (!isOpen) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      smootherRef.current.reset();
      pitchCalibratorRef.current.reset();
      lastFaceSeenAtRef.current = null;
      missingMatrixCountRef.current = 0;
      queueMicrotask(() => {
        setPermission("idle");
        setCaptured(null);
        setFaceState("searching");
      });
      return;
    }

    const cancelledRef = { cancelled: false };
    queueMicrotask(() => requestCamera(cancelledRef));
    return () => {
      cancelledRef.cancelled = true;
    };
  }, [isOpen, requestCamera]);

  /**
   * Feeds one tracked frame to the 3D overlay. Position and size come from
   * the landmark-derived pose (so all of the 2D path's tuning still applies),
   * while rotation and depth come from MediaPipe's head-pose matrix.
   */
  const updateThreeOverlay = useCallback(
    (
      pose: FacePose,
      tryOn: TryOnConfig,
      video: HTMLVideoElement,
      matrixData: MediapipeMatrix | undefined,
      timestampMs: number
    ) => {
      const placed = matrixData
        ? overlay3dRef.current?.update({
            matrixData,
            timestampMs,
            anchorU: pose.anchorX / video.videoWidth,
            anchorV: pose.anchorY / video.videoHeight,
            // `projectedWidth`, not `width`: the scene undoes the
            // foreshortening itself, from the rotation it is about to render.
            projectedLensSpanFrac:
              (pose.projectedWidth * tryOn.scale * DEFAULT_LENS_SPAN_FRAC) / video.videoWidth,
            faceWidthFrac: pose.templeWidth / video.videoWidth,
            offsetX: tryOn.offsetX,
            offsetY: tryOn.offsetY,
            rollOffsetDeg: tryOn.rotationOffset,
          })
        : overlay3dRef.current?.update(null);

      // `undefined` means the lazy overlay hasn't mounted yet — not a failure.
      if (placed === false && ++missingMatrixCountRef.current === MISSING_MATRIX_LIMIT) {
        console.warn("[try-on] No usable head-pose matrix — falling back to the 2D overlay.");
        // Flipping the badge back to 2D without saying anything is
        // indistinguishable from the toggle simply not working.
        setThreeUnavailable(true);
        setChosenMode("2d");
      } else if (placed) {
        missingMatrixCountRef.current = 0;
      }
    },
    []
  );

  // Detection loop.
  useEffect(() => {
    if (!isOpen || permission !== "granted") return;
    let raf = 0;

    const tick = () => {
      const video = videoRef.current;
      const size = stageSizeRef.current;
      const currentProduct = productRef.current;

      if (video && video.readyState >= 2) {
        // Taken from the video itself each frame rather than from a
        // `loadedmetadata` handler: the stream is attached imperatively after
        // mount, so that event can land before React has wired anything up —
        // and without a size the 3D canvas is left zero-sized and invisible,
        // which looks exactly like the 3D mode "not working".
        if (
          video.videoWidth &&
          (videoSizeRef.current.width !== video.videoWidth ||
            videoSizeRef.current.height !== video.videoHeight)
        ) {
          videoSizeRef.current = { width: video.videoWidth, height: video.videoHeight };
          setVideoSize(videoSizeRef.current);
        }

        const now = performance.now();
        const result = detect(video, now);
        const faces = (result?.faceLandmarks ?? []) as NormalizedPoint[][];

        if (faces.length === 0) {
          const lastSeen = lastFaceSeenAtRef.current;
          if (lastSeen === null || now - lastSeen >= NO_FACE_GRACE_MS) {
            // Genuinely lost, not just a dropped frame — clear and reset.
            setFaceState("searching");
            smootherRef.current.next(null, now);
            setPlacement(null);
            setSideOverlay(null);
            overlay3dRef.current?.update(null);
          }
          // Else: within the grace window, hold the last placement as-is.
        } else {
          lastFaceSeenAtRef.current = now;
          setFaceState(faces.length > 1 ? "multiple" : "tracking");
          const rawPose = computeFacePose(
            faces[0],
            video.videoWidth,
            video.videoHeight,
            pitchCalibratorRef.current
          );
          const pose = smootherRef.current.next(rawPose, now);

          if (pose && currentProduct && size.width && size.height) {
            if (modeRef.current) {
              updateThreeOverlay(
                pose,
                currentProduct.tryOn,
                video,
                result?.facialTransformationMatrixes?.[0],
                now
              );
            } else {
              setPlacement(computeOverlayPlacement(pose, currentProduct.tryOn, video, size));
              setSideOverlay(selectSideOverlay(pose, currentProduct.tryOn, video, size));
            }
          } else {
            setPlacement(null);
            setSideOverlay(null);
            overlay3dRef.current?.update(null);
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, permission, detect, updateThreeOverlay]);

  const retryPermission = useCallback(() => {
    requestCamera({ cancelled: false });
  }, [requestCamera]);

  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = stageSizeRef.current;
    if (!video || !canvas || !product || !size.width || !size.height) return;

    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { scale, offsetX, offsetY } = computeCoverTransform(video, size);

    ctx.save();
    ctx.translate(size.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, -offsetX, -offsetY, video.videoWidth * scale, video.videoHeight * scale);

    if (is3d) {
      // The 3D canvas already covers exactly this rectangle on screen, so the
      // same destination rectangle reproduces the live preview one-for-one.
      const glCanvas = overlay3dRef.current?.captureCanvas();
      if (glCanvas) {
        ctx.drawImage(glCanvas, -offsetX, -offsetY, video.videoWidth * scale, video.videoHeight * scale);
      }
      ctx.restore();
      setCaptured(canvas.toDataURL("image/png"));
      return;
    }

    if (placement) {
      const blend = sideOverlay ? sideBlendWeight(placement.yawDeg) : 0;
      try {
        if (blend < 1) {
          const overlayImg = await loadImage(getProductVisualSrc(product));
          // The preview fades the temple arms; bake that in here too, or the
          // saved photo comes out as a hard-edged cut-out that doesn't match
          // what the user framed.
          const faded = maskedOverlayCanvas(
            overlayImg,
            placement.widthPx,
            placement.heightPx,
            edgeFade(product.tryOn.edgeFade, placement.yawDeg)
          );
          drawOverlayImage(ctx, faded ?? overlayImg, placement, 1 - blend);
        }
        if (sideOverlay && blend > 0) {
          const sideImg = await loadImage(sideOverlay.src);
          drawOverlayImage(ctx, sideImg, sideOverlay.placement, blend);
        }
      } catch {
        // ignore, still show the plain photo
      }
    }
    ctx.restore();

    setCaptured(canvas.toDataURL("image/png"));
  };

  return (
    <AnimatePresence>
      {isOpen && product && (
        <motion.div
          className="fixed inset-0 z-[80] bg-gradient-to-b from-[#0b0d14] via-[#10131c] to-[#07080d]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {captured ? (
            <CapturePreview
              imageDataUrl={captured}
              product={product}
              onRetry={() => setCaptured(null)}
              onOrder={() => openWhatsAppOrder(product, { triedOn: true })}
            />
          ) : (
            <div className="flex h-full w-full flex-col">
              <div className="flex items-center justify-between px-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))" }}>
                <button
                  onClick={closeTryOn}
                  className="glass-dark flex h-10 w-10 items-center justify-center rounded-full text-white transition active:scale-95"
                  aria-label="إغلاق"
                >
                  <IconClose className="h-5 w-5" />
                </button>
                <div className="glass-dark flex flex-col items-center rounded-full px-5 py-2">
                  <p className="text-sm font-bold leading-tight text-white">تجربة النظارة</p>
                  <p className="text-[10px] leading-tight text-white/60">{product.brand} — {product.name}</p>
                </div>
                <button
                  onClick={() => {
                    setThreeUnavailable(false);
                    missingMatrixCountRef.current = 0;
                    setChosenMode(is3d ? "2d" : "3d");
                  }}
                  className={`glass-dark flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold transition active:scale-95 ${
                    is3d ? "text-white ring-1 ring-white/60" : "text-white/70"
                  }`}
                  aria-label={is3d ? "التبديل إلى العرض ثنائي الأبعاد" : "التبديل إلى العرض ثلاثي الأبعاد"}
                >
                  {is3d ? "3D" : "2D"}
                </button>
              </div>

              <div
                ref={stageRef}
                className="relative mx-auto mt-3 w-full max-w-xl flex-1 overflow-hidden ring-1 ring-white/10 sm:rounded-[32px]"
              >
                <div className="absolute inset-0" style={{ transform: "scaleX(-1)" }}>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {is3d ? (
                    // Mirrored along with the video by the wrapper above, so
                    // the 3D render and the face it sits on stay in step.
                    <GlassesOverlay3D ref={overlay3dRef} product={product} rect={overlayRect} />
                  ) : (
                    <GlassesOverlay
                      product={product}
                      placement={placement}
                      sideSrc={sideOverlay?.src}
                      sidePlacement={sideOverlay?.placement}
                    />
                  )}
                </div>

                {threeUnavailable && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-6">
                    <p className="glass-dark rounded-full px-4 py-2 text-center text-xs font-semibold text-white">
                      تعذّر تشغيل العرض ثلاثي الأبعاد على هذا الجهاز، تم الرجوع للعرض العادي
                    </p>
                  </div>
                )}

                {permission === "granted" && faceState !== "tracking" && (
                  <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-6">
                    <p className="glass-dark rounded-full px-4 py-2 text-center text-xs font-semibold text-white">
                      {faceState === "multiple"
                        ? "الرجاء إبقاء شخص واحد فقط أمام الكاميرا"
                        : landmarkerStatus === "ready"
                        ? "لم يتم اكتشاف الوجه، حاول الاقتراب من الكاميرا"
                        : "خلي وجهك داخل الإطار"}
                    </p>
                  </div>
                )}

                <PermissionOverlay
                  permission={permission}
                  landmarkerStatus={landmarkerStatus}
                  onRetry={retryPermission}
                  onClose={closeTryOn}
                />
              </div>

              <div className="safe-bottom mx-auto mt-3 w-full max-w-xl px-2 pb-3">
                <div className="glass-dark flex flex-col gap-3 rounded-[28px] px-1 py-3">
                  <TryOnProductSelector activeId={product.id} onSelect={setTryOnProductId} />
                  <div className="px-4">
                    <CameraControls
                      disabled={permission !== "granted"}
                      onCapture={handleCapture}
                      onOrder={() => openWhatsAppOrder(product, { triedOn: true })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PermissionOverlay({
  permission,
  landmarkerStatus,
  onRetry,
  onClose,
}: {
  permission: PermissionState;
  landmarkerStatus: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  if (permission === "granted") {
    if (landmarkerStatus === "loading" || landmarkerStatus === "idle") {
      return (
        <StatusScreen>
          <Spinner />
          <p className="mt-4 text-sm font-semibold text-white">جاري تجهيز تجربة النظارة...</p>
        </StatusScreen>
      );
    }
    return null;
  }

  if (permission === "requesting") {
    return (
      <StatusScreen>
        <Spinner />
        <p className="mt-4 text-sm font-semibold text-white">في انتظار إذن الكاميرا...</p>
      </StatusScreen>
    );
  }

  if (permission === "denied") {
    return (
      <StatusScreen>
        <p className="text-base font-bold text-white">نحتاج إلى صلاحية الكاميرا</p>
        <p className="mt-2 max-w-xs text-sm text-white/70">
          نحتاج إلى صلاحية الكاميرا حتى تتمكن من تجربة النظارة. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة.
        </p>
        <div className="mt-5 flex gap-2.5">
          <Button variant="primary" size="md" onClick={onRetry}>
            إعادة المحاولة
          </Button>
          <Button variant="secondary" size="md" className="!border-white/40 !text-white" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </StatusScreen>
    );
  }

  if (permission === "unsupported") {
    return (
      <StatusScreen>
        <p className="text-base font-bold text-white">المتصفح غير مدعوم</p>
        <p className="mt-2 max-w-xs text-sm text-white/70">
          متصفحك لا يدعم تجربة النظارة الافتراضية. جرّب فتح الموقع من متصفح Chrome أو Safari محدث.
        </p>
        <Button variant="secondary" size="md" className="mt-5 !border-white/40 !text-white" onClick={onClose}>
          إغلاق
        </Button>
      </StatusScreen>
    );
  }

  // unavailable
  return (
    <StatusScreen>
      <p className="text-base font-bold text-white">تعذّر الوصول إلى الكاميرا</p>
      <p className="mt-2 max-w-xs text-sm text-white/70">تأكد من أن الكاميرا غير مستخدمة في تطبيق آخر وحاول مجدداً.</p>
      <div className="mt-5 flex gap-2.5">
        <Button variant="primary" size="md" onClick={onRetry}>
          إعادة المحاولة
        </Button>
        <Button variant="secondary" size="md" className="!border-white/40 !text-white" onClick={onClose}>
          إغلاق
        </Button>
      </div>
    </StatusScreen>
  );
}

function StatusScreen({ children }: { children: ReactNode }) {
  return (
    // Solid scrim rather than a full-screen backdrop-filter: blurring the
    // whole viewport is expensive on mid-range phones, and the panel below
    // already carries the glass treatment.
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "rgba(8, 9, 14, 0.88)" }}
    >
      <div className="glass-dark flex flex-col items-center rounded-[28px] px-7 py-8">{children}</div>
    </div>
  );
}

function Spinner() {
  return <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />;
}
