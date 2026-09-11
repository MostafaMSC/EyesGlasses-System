"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useShopUI } from "@/context/ShopUIContext";
import { getProductVisualSrc } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { useFaceLandmarker } from "@/lib/useFaceLandmarker";
import { useElementSize } from "@/lib/useElementSize";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { computeFacePose, FacePoseSmoother, PitchCalibrator, type NormalizedPoint } from "@/lib/faceGeometry";
import {
  computeCoverTransform,
  computeEarClip,
  computeOverlayPlacement,
  earClipToCssPath,
  selectSideOverlay,
  type EarClip,
  type OverlayPlacement,
  type SideOverlaySelection,
} from "@/lib/overlayPlacement";
import { loadImage } from "@/lib/loadImage";
import { CONTACT_SHADOW, edgeFade, maskedOverlayCanvas, sideBlendWeight } from "@/lib/overlayAppearance";
import { openWhatsAppOrder } from "@/lib/whatsapp";
import { GlassesOverlay } from "@/components/try-on/GlassesOverlay";
import { TryOnProductSelector } from "@/components/try-on/TryOnProductSelector";
import { CameraControls } from "@/components/try-on/CameraControls";
import { CapturePreview } from "@/components/try-on/CapturePreview";
import { IconClose } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";

type PermissionState = "idle" | "requesting" | "granted" | "denied" | "unavailable" | "unsupported";
type FaceState = "searching" | "tracking" | "multiple";

/**
 * A single frame with zero detected faces (motion blur, a hand crossing the
 * face, brief occlusion by the glasses already being tried on) is common and
 * shouldn't make the overlay vanish and snap back — that reads as jitter.
 * Only treat tracking as truly lost after it's been missing this long.
 */
const NO_FACE_GRACE_MS = 400;

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
  alpha: number,
  earClip?: EarClip | null
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
  // Mirrors the live preview's CSS clip-path (computeEarClip): clip the
  // temple arm at roughly the ear so a captured angled photo matches what
  // was on screen, not just the un-clipped front image.
  if (earClip) {
    const w = placement.widthPx;
    const h = placement.heightPx;
    ctx.beginPath();
    if (earClip.side === "right") {
      ctx.rect(-w / 2, -h / 2, w * earClip.visibleFraction, h);
    } else {
      const clippedFromLeft = w * earClip.visibleFraction;
      ctx.rect(-w / 2 + clippedFromLeft, -h / 2, w - clippedFromLeft, h);
    }
    ctx.clip();
  }
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

  const [permission, setPermission] = useState<PermissionState>("idle");
  const [faceState, setFaceState] = useState<FaceState>("searching");
  const [placement, setPlacement] = useState<OverlayPlacement | null>(null);
  const [sideOverlay, setSideOverlay] = useState<SideOverlaySelection | null>(null);
  const [earClip, setEarClip] = useState<EarClip | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);

  useEffect(() => {
    productRef.current = product;
  }, [product]);
  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

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

  // Detection loop.
  useEffect(() => {
    if (!isOpen || permission !== "granted") return;
    let raf = 0;

    const tick = () => {
      const video = videoRef.current;
      const size = stageSizeRef.current;
      const currentProduct = productRef.current;

      if (video && video.readyState >= 2) {
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
            setEarClip(null);
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
            const nextPlacement = computeOverlayPlacement(pose, currentProduct.tryOn, video, size);
            setPlacement(nextPlacement);
            setSideOverlay(selectSideOverlay(pose, currentProduct.tryOn, video, size));
            setEarClip(nextPlacement ? computeEarClip(pose, nextPlacement, video, size) : null);
          } else {
            setPlacement(null);
            setSideOverlay(null);
            setEarClip(null);
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, permission, detect]);

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
          drawOverlayImage(ctx, faded ?? overlayImg, placement, 1 - blend, earClip);
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
                <span className="w-10" />
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
                  <GlassesOverlay
                    product={product}
                    placement={placement}
                    sideSrc={sideOverlay?.src}
                    sidePlacement={sideOverlay?.placement}
                    earClipPath={earClipToCssPath(earClip)}
                  />
                </div>

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
