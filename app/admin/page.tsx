"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { frameSvgDataUri, type FrameShape } from "@/lib/frameShapes";
import { getProductVisualSrc, type Availability, type Category, type Product } from "@/data/products";
import { newProductId, slugify, useProductStore } from "@/lib/productStore";
import {
  prepareWorkingFrame,
  finalizeFrame,
  processSideFrameImage,
  type ManualLensSeeds,
  type ProcessedFrame,
  type WorkingFrame,
  type FrameBox,
} from "@/lib/processFrameImage";
import { useShopUI } from "@/context/ShopUIContext";
import { formatPrice } from "@/lib/format";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { IconGlasses, IconClose, IconDownload, IconCamera } from "@/components/ui/Icons";

const FRAME_SHAPES: { value: FrameShape; label: string }[] = [
  { value: "acetateSquare", label: "أسيتات مربع (أسود كلاسيكي)" },
  { value: "metalSquare", label: "معدني مربع رفيع" },
  { value: "opticalSquare", label: "طبي مربع" },
  { value: "wayfarer", label: "ويفيرر" },
  { value: "aviator", label: "طياري (أفياتور)" },
  { value: "round", label: "دائري" },
  { value: "rectangle", label: "مستطيل" },
  { value: "catEye", label: "كات آي" },
  { value: "oversized", label: "كبير الحجم" },
  { value: "sport", label: "رياضي" },
];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "sunglasses", label: "نظارات شمسية" },
  { value: "optical", label: "نظارات طبية" },
];

const AVAILABILITY: { value: Availability; label: string }[] = [
  { value: "in_stock", label: "متوفر" },
  { value: "low_stock", label: "كمية محدودة" },
  { value: "preorder", label: "بحسب الطلب" },
];

const MAX_IMAGE_BYTES = 1_500_000;
/**
 * Bigger than the photo limit because a textured eyewear GLB legitimately runs
 * a few megabytes, and it is stored inline in IndexedDB as a data URL (which
 * adds about a third on top).
 */
const MAX_MODEL_BYTES = 8_000_000;

interface FormState {
  brand: string;
  name: string;
  category: Category;
  price: string;
  description: string;
  availability: Availability;
  colorName: string;
  frameShape: FrameShape;
  color: string;
  lensColor: string;
  lensOpacity: number;
  templeColor: string;
  bestseller: boolean;
  isNew: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationOffset: number;
  overlayImage: string;
  lensLeftX: number;
  lensRightX: number;
  lensY: number;
  imageAspect: number;
  edgeFade: number;
  leftImage: string;
  leftAnchorX: number;
  leftAnchorY: number;
  leftAspect: number;
  rightImage: string;
  rightAnchorX: number;
  rightAnchorY: number;
  rightAspect: number;
  model3d: string;
  hideLenses: boolean;
}

const EMPTY: FormState = {
  brand: "",
  name: "",
  category: "optical",
  price: "",
  description: "",
  availability: "in_stock",
  colorName: "أسود",
  frameShape: "acetateSquare",
  color: "#141414",
  lensColor: "#e2ecf3",
  lensOpacity: 0.1,
  templeColor: "#c8ccd2",
  bestseller: false,
  isNew: true,
  scale: 1,
  offsetX: 0,
  offsetY: 0.04,
  rotationOffset: 0,
  overlayImage: "",
  lensLeftX: 0.2333,
  lensRightX: 0.7667,
  lensY: 0.4833,
  imageAspect: 2.5,
  edgeFade: 0.12,
  leftImage: "",
  leftAnchorX: 0.5,
  leftAnchorY: 0.5,
  leftAspect: 500 / 380,
  rightImage: "",
  rightAnchorX: 0.5,
  rightAnchorY: 0.5,
  rightAspect: 500 / 380,
  model3d: "",
  // Generated models ship with opaque lenses that hide the eyes, which
  // defeats a try-on — so a new product starts with them stripped. Sunglasses
  // can turn this off.
  hideLenses: true,
};

export default function AdminPage() {
  const {
    customProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    hydrated,
    strandedLocalProducts,
    importLocalProducts,
    importProducts,
  } = useProductStore();
  const { openTryOn } = useShopUI();

  /** "checking" until the session cookie has been verified with the server. */
  const [session, setSession] = useState<AdminSessionState>("checking");

  useEffect(() => {
    fetch("/api/admin/session")
      .then((res) => res.json())
      .then((body: { configured?: boolean; authenticated?: boolean }) => {
        if (!body.configured) setSession("unconfigured");
        else setSession(body.authenticated ? "in" : "out");
      })
      .catch(() => setSession("out"));
  }, []);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [pickingSeeds, setPickingSeeds] = useState(false);
  const [workingFrame, setWorkingFrame] = useState<WorkingFrame | null>(null);
  const [croppingArms, setCroppingArms] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importRef = useRef<HTMLInputElement>(null);

  /**
   * Restores a catalogue from a **تصدير JSON** file. This is how a catalogue
   * built on one machine reaches another: browser storage is per-origin, so
   * the "import from this browser" offer can't see products saved against a
   * different host.
   */
  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const n = await importProducts(list as Product[]);
      setMessage({ kind: "ok", text: `تم استيراد ${n} نظارة إلى السيرفر.` });
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "تعذّر قراءة ملف JSON.",
      });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const previewSrc = useMemo(() => {
    if (form.overlayImage) return form.overlayImage;
    return frameSvgDataUri(form.frameShape, {
      color: form.color,
      lensColor: form.lensColor,
      lensOpacity: form.lensOpacity,
      templeColor: form.templeColor,
    });
  }, [form.overlayImage, form.frameShape, form.color, form.lensColor, form.lensOpacity, form.templeColor]);

  const buildProduct = (id: string): Product => ({
    id,
    slug: slugify(`${form.brand}-${form.name}`),
    brand: form.brand.trim(),
    name: form.name.trim(),
    category: form.category,
    price: Number(form.price) || 0,
    images: [],
    description: form.description.trim() || "—",
    colors: [{ name: form.colorName || "أساسي", hex: form.color }],
    availability: form.availability,
    bestseller: form.bestseller,
    isNew: form.isNew,
    featured: form.bestseller,
    createdAt: new Date().toISOString().slice(0, 10),
    tryOn: {
      frameShape: form.frameShape,
      color: form.color,
      lensColor: form.lensColor,
      lensOpacity: form.lensOpacity,
      templeColor: form.templeColor,
      ...(form.overlayImage
        ? {
            overlayImage: form.overlayImage,
            overlayGeometry: {
              aspect: form.imageAspect,
              lensLeftX: form.lensLeftX,
              lensRightX: form.lensRightX,
              lensY: form.lensY,
            },
          }
        : {}),
      edgeFade: form.edgeFade,
      scale: form.scale,
      offsetX: form.offsetX,
      offsetY: form.offsetY,
      rotationOffset: form.rotationOffset,
      ...(form.leftImage
        ? {
            leftImage: form.leftImage,
            leftImageGeometry: { aspect: form.leftAspect, anchorX: form.leftAnchorX, anchorY: form.leftAnchorY },
          }
        : {}),
      ...(form.rightImage
        ? {
            rightImage: form.rightImage,
            rightImageGeometry: { aspect: form.rightAspect, anchorX: form.rightAnchorX, anchorY: form.rightAnchorY },
          }
        : {}),
      ...(form.model3d ? { model3d: form.model3d, hideLenses: form.hideLenses } : {}),
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.brand.trim() || !form.name.trim()) {
      setMessage({ kind: "error", text: "الماركة واسم الموديل مطلوبان." });
      return;
    }
    try {
      if (editingId) {
        await updateProduct(editingId, buildProduct(editingId));
        setMessage({ kind: "ok", text: "تم تحديث النظارة." });
      } else {
        const id = newProductId();
        await addProduct(buildProduct(id));
        setMessage({ kind: "ok", text: "تمت إضافة النظارة. تقدر تجربها بالكاميرا الآن." });
      }
      setForm(EMPTY);
      setEditingId(null);
      setLastFile(null);
      setWorkingFrame(null);
      setPickingSeeds(false);
      setCroppingArms(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setMessage({
        kind: "error",
        text: "تعذّر الحفظ — غالباً بسبب حجم الصورة. جرّب صورة أصغر.",
      });
    }
  };

  const applyProcessedResult = (result: ProcessedFrame, source: "auto" | "seeds" | "crop") => {
    setForm((f) => ({
      ...f,
      overlayImage: result.dataUrl,
      imageAspect: result.geometry.aspect,
      lensLeftX: result.geometry.lensLeftX,
      lensRightX: result.geometry.lensRightX,
      lensY: result.geometry.lensY,
      // The temple arms are cropped off during processing, so the image edge
      // is now the rim itself — barely any fade is wanted.
      edgeFade: result.templesCropped ? 0.04 : f.edgeFade,
    }));

    const done: string[] = [];
    if (!result.alreadyTransparent) done.push("إزالة الخلفية");
    if (result.templesCropped) done.push("قصّ الأذرع الجانبية");
    if (result.lensesDetected) done.push("تحديد مواضع العدسات");

    if (source === "crop") {
      setMessage({ kind: "ok", text: "تم قصّ الإطار يدوياً." });
    } else if (source === "seeds") {
      // Even a human's two clicks can still fail the shape/geometry sanity
      // checks (a truly ambiguous photo) — say so instead of always claiming
      // success, or the admin has no reason to try the crop tool next.
      setMessage(
        result.lensesDetected
          ? { kind: "ok", text: "تم تحديد العدسات من النقرتين." }
          : {
              kind: "warn",
              text: `تمت ${done.join("، و")}، لكن لم يتم تحديد العدسات حتى من نقطتيك. جرّب "قص الأذرع يدوياً" بالأسفل.`,
            }
      );
    } else if (result.warning) {
      setMessage({ kind: "warn", text: result.warning });
    } else if (result.lensesDetected) {
      setMessage({ kind: "ok", text: `تمت ${done.join("، و")} تلقائياً.` });
    } else {
      setMessage({
        kind: "warn",
        text: `تمت ${done.join("، و")}، لكن لم يتم تحديد العدسات تلقائياً. اضغط "تحديد العدسات بالنقر" أو "قص الأذرع يدوياً" بالأسفل، أو عدّل الأشرطة يدوياً.`,
      });
    }
  };

  const handleImage = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setMessage({ kind: "error", text: "حجم الصورة كبير. الحد الأقصى 1.5 ميغابايت." });
      return;
    }
    setLastFile(file);
    setPickingSeeds(false);
    setCroppingArms(false);
    setProcessing(true);
    setMessage(null);
    try {
      const working = await prepareWorkingFrame(file);
      setWorkingFrame(working);
      const result = await finalizeFrame(working, working.autoBox);
      applyProcessedResult(result, "auto");
    } catch {
      setMessage({ kind: "error", text: "تعذّرت معالجة الصورة. جرّب صورة أخرى." });
    } finally {
      setProcessing(false);
    }
  };

  const handleManualSeeds = async (seeds: ManualLensSeeds) => {
    if (!lastFile) return;
    setProcessing(true);
    setMessage(null);
    try {
      const working = await prepareWorkingFrame(lastFile, seeds);
      setWorkingFrame(working);
      const result = await finalizeFrame(working, working.autoBox);
      applyProcessedResult(result, "seeds");
    } catch {
      setMessage({ kind: "error", text: "تعذّرت معالجة الصورة. جرّب صورة أخرى." });
    } finally {
      setProcessing(false);
      setPickingSeeds(false);
    }
  };

  const handleManualCrop = async (box: FrameBox) => {
    if (!workingFrame) return;
    setProcessing(true);
    setMessage(null);
    try {
      const result = await finalizeFrame(workingFrame, box);
      applyProcessedResult(result, "crop");
    } catch {
      setMessage({ kind: "error", text: "تعذّر تطبيق القص. جرّب مرة أخرى." });
    } finally {
      setProcessing(false);
      setCroppingArms(false);
    }
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    const t = product.tryOn;
    setForm({
      brand: product.brand,
      name: product.name,
      category: product.category,
      price: String(product.price),
      description: product.description,
      availability: product.availability,
      colorName: product.colors[0]?.name ?? "أساسي",
      frameShape: t.frameShape,
      color: t.color,
      lensColor: t.lensColor ?? "#e2ecf3",
      lensOpacity: t.lensOpacity ?? 0.1,
      templeColor: t.templeColor ?? "#c8ccd2",
      bestseller: Boolean(product.bestseller),
      isNew: Boolean(product.isNew),
      scale: t.scale,
      offsetX: t.offsetX,
      offsetY: t.offsetY,
      rotationOffset: t.rotationOffset,
      overlayImage: t.overlayImage ?? "",
      lensLeftX: t.overlayGeometry?.lensLeftX ?? EMPTY.lensLeftX,
      lensRightX: t.overlayGeometry?.lensRightX ?? EMPTY.lensRightX,
      lensY: t.overlayGeometry?.lensY ?? EMPTY.lensY,
      imageAspect: t.overlayGeometry?.aspect ?? EMPTY.imageAspect,
      edgeFade: t.edgeFade ?? EMPTY.edgeFade,
      leftImage: t.leftImage ?? "",
      leftAnchorX: t.leftImageGeometry?.anchorX ?? EMPTY.leftAnchorX,
      leftAnchorY: t.leftImageGeometry?.anchorY ?? EMPTY.leftAnchorY,
      leftAspect: t.leftImageGeometry?.aspect ?? EMPTY.leftAspect,
      rightImage: t.rightImage ?? "",
      rightAnchorX: t.rightImageGeometry?.anchorX ?? EMPTY.rightAnchorX,
      rightAnchorY: t.rightImageGeometry?.anchorY ?? EMPTY.rightAnchorY,
      rightAspect: t.rightImageGeometry?.aspect ?? EMPTY.rightAspect,
      model3d: t.model3d ?? "",
      hideLenses: t.hideLenses ?? EMPTY.hideLenses,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(customProducts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-products.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // The catalogue is shared and server-stored now, so the panel stays shut
  // until the password is accepted.
  if (session !== "in") {
    return <AdminLogin state={session} onAuthenticated={() => setSession("in")} />;
  }

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">
              لوحة إدارة النظارات
            </h1>
            <p className="mt-2 text-sm text-muted">
              أضف نظارة جديدة وجربها على الكاميرا مباشرة. تُحفظ على السيرفر وتظهر لكل الزوار.
            </p>
          </div>
          <div className="flex gap-2">
            <Button href="/catalog" variant="secondary" size="sm">
              عرض المتجر
            </Button>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/admin/session", { method: "DELETE" });
                setSession("out");
              }}
              className="rounded-full border border-line px-4 py-1.5 text-xs font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink"
            >
              خروج
            </button>
          </div>
        </div>

        {strandedLocalProducts.length > 0 && (
          // Products from before the catalogue moved to the server. They are
          // invisible to customers where they are, and clearing browser data
          // would lose them for good.
          <div className="mb-6 rounded-2xl bg-accent/10 px-4 py-3 text-sm text-ink">
            <p className="font-bold text-accent">
              عندك {strandedLocalProducts.length} نظارة محفوظة في هذا المتصفح فقط
            </p>
            <p className="mt-1 text-xs leading-6 text-muted">
              هذي أُضيفت قبل نقل الكاتالوج إلى السيرفر، فالزوار لا يرونها. انقلها مرة واحدة
              لتصبح جزءاً من المتجر.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  const n = await importLocalProducts();
                  setMessage({ kind: "ok", text: `تم نقل ${n} نظارة إلى السيرفر.` });
                } catch (err) {
                  setMessage({
                    kind: "error",
                    text: err instanceof Error ? err.message : "تعذّر النقل.",
                  });
                }
              }}
              className="mt-3 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-white transition active:scale-95"
            >
              نقلها إلى السيرفر
            </button>
          </div>
        )}

        {message && (
          <div
            className={`mb-6 rounded-2xl px-4 py-3 text-sm font-semibold ${
              message.kind === "ok"
                ? "bg-success/10 text-success"
                : message.kind === "warn"
                ? "bg-accent/10 text-accent"
                : "bg-danger/10 text-danger"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <form onSubmit={handleSubmit} className="card rounded-3xl p-5 sm:p-6">
            <h2 className="mb-5 font-display text-lg font-bold">
              {editingId ? "تعديل النظارة" : "إضافة نظارة جديدة"}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الماركة *">
                <input className={inputCls} value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Ray-Ban" />
              </Field>
              <Field label="اسم الموديل *">
                <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Aviator Classic" />
              </Field>
              <Field label="السعر (د.ع)">
                <input className={inputCls} type="number" inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="185000" />
              </Field>
              <Field label="النوع">
                <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="التوفر">
                <select className={inputCls} value={form.availability} onChange={(e) => set("availability", e.target.value as Availability)}>
                  {AVAILABILITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </Field>
              <Field label="اسم اللون">
                <input className={inputCls} value={form.colorName} onChange={(e) => set("colorName", e.target.value)} />
              </Field>
            </div>

            <Field label="الوصف" className="mt-4">
              <textarea className={`${inputCls} min-h-[80px]`} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>

            <hr className="my-6 border-line" />
            <h3 className="mb-4 text-sm font-bold text-ink">شكل النظارة</h3>

            <Field label="القصّة">
              <select
                className={inputCls}
                value={form.frameShape}
                onChange={(e) => set("frameShape", e.target.value as FrameShape)}
                disabled={Boolean(form.overlayImage)}
              >
                {FRAME_SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="لون الإطار">
                <input type="color" className={colorCls} value={form.color} onChange={(e) => set("color", e.target.value)} />
              </Field>
              <Field label="لون الذراع">
                <input type="color" className={colorCls} value={form.templeColor} onChange={(e) => set("templeColor", e.target.value)} />
              </Field>
              <Field label="لون العدسة">
                <input type="color" className={colorCls} value={form.lensColor} onChange={(e) => set("lensColor", e.target.value)} />
              </Field>
            </div>

            <Field label={`عتامة العدسة: ${form.lensOpacity.toFixed(2)} (منخفض = شفاف)`} className="mt-4">
              <input type="range" min={0.05} max={0.85} step={0.01} value={form.lensOpacity} onChange={(e) => set("lensOpacity", Number(e.target.value))} className="w-full" />
            </Field>

            <hr className="my-6 border-line" />
            <h3 className="mb-2 text-sm font-bold text-ink">صورة حقيقية (اختياري)</h3>
            <p className="mb-3 text-xs leading-6 text-muted">
              صورة للنظارة <strong>من الأمام مباشرة</strong> (وليست بزاوية). لا حاجة لخلفية شفافة —
              الخلفية البيضاء تُزال تلقائياً ويتم تحديد مكان العدسات. الحد الأقصى 1.5 ميغابايت.
            </p>
            <details className="mb-3 rounded-xl border border-line bg-surface-2 p-3 text-xs leading-6 text-muted">
              <summary className="cursor-pointer select-none font-bold text-ink-soft">
                كيف أصوّر النظارة لأفضل نتيجة؟
              </summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 font-bold text-ink-soft">الأفضل</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    <li>خلفية بيضاء أو رمادية فاتحة موحّدة، بلا نقوش أو تدرّج</li>
                    <li>من الأمام مباشرة، والإطار مستقيم غير مائل</li>
                    <li>إضاءة ناعمة وموزّعة (بدون فلاش مباشر)</li>
                    <li>صورة حادة وواضحة، خصوصاً عند أطراف الأذرع</li>
                    <li>الشعار (إن وجد) خارج حدود النظارة تماماً — فوقها أو تحتها</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-bold text-ink-soft">تجنّب</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    <li>خلفيات خشبية/طبيعية أو صوراً بزاوية أو بضبابية (bokeh)</li>
                    <li>وهج أو انعكاس ضوئي واضح على العدسة</li>
                    <li>عدسات بتدرّج لوني قوي (يصعّب تحديد حوافها تلقائياً)</li>
                    <li>نصوص محفورة على العدسة نفسها إن أمكن تفاديها</li>
                    <li>وضع النظارة بزاوية أو الأذرع متقاطعة فوق بعضها</li>
                  </ul>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted/80">
                صورة لا تطابق هذه المعايير قد تنجح تلقائياً، لكن إن لم تنجح استخدم &quot;تحديد
                العدسات بالنقر&quot; أو &quot;قص الأذرع يدوياً&quot; أدناه بدل إعادة المحاولة تلقائياً.
              </p>
            </details>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              disabled={processing}
              onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])}
              className="block w-full text-sm text-ink-soft file:me-3 file:rounded-full file:border-0 file:bg-surface-3 file:text-ink-soft file:px-4 file:py-2 file:text-sm file:font-semibold disabled:opacity-50"
            />
            {processing && (
              <p className="mt-3 flex items-center gap-2 text-xs font-bold text-accent">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                جاري إزالة الخلفية وتحديد العدسات…
              </p>
            )}
            {form.overlayImage && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    set("overlayImage", "");
                    setLastFile(null);
                    setWorkingFrame(null);
                    setPickingSeeds(false);
                    setCroppingArms(false);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-danger"
                >
                  <IconClose className="h-3.5 w-3.5" /> إزالة الصورة واستخدام الرسم
                </button>

                {lastFile && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPickingSeeds((v) => !v);
                          setCroppingArms(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 py-1.5 text-xs font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink"
                      >
                        <IconCamera className="h-3.5 w-3.5" />
                        {pickingSeeds ? "إلغاء التحديد اليدوي" : "تحديد العدسات بالنقر"}
                      </button>
                      {workingFrame && (
                        <button
                          type="button"
                          onClick={() => {
                            setCroppingArms((v) => !v);
                            setPickingSeeds(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 py-1.5 text-xs font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink"
                        >
                          {croppingArms ? "إلغاء القص اليدوي" : "قص الأذرع يدوياً"}
                        </button>
                      )}
                    </div>
                    {pickingSeeds && (
                      <>
                        <p className="mt-2 text-xs leading-6 text-muted">
                          انقر على مركز العدسة اليسرى (على الصورة) ثم مركز العدسة اليمنى. يُعاد
                          تحليل الصورة من نقطتيك مباشرة — مفيد إذا فشل التحديد التلقائي.
                        </p>
                        <SeedPicker
                          key={`${lastFile.name}-${lastFile.size}-${lastFile.lastModified}`}
                          file={lastFile}
                          onPick={handleManualSeeds}
                        />
                      </>
                    )}
                    {croppingArms && workingFrame && (
                      <>
                        <p className="mt-2 text-xs leading-6 text-muted">
                          حرّك المربع أو اسحب زواياه ليحيط بواجهة الإطار (العدستين والجسر) فقط،
                          مستبعداً الأذرع الجانبية بالكامل، ثم اضغط &quot;تطبيق القص&quot;.
                        </p>
                        <FrameCropTool working={workingFrame} onApply={handleManualCrop} />
                      </>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={`مركز العدسة اليسرى: ${form.lensLeftX.toFixed(3)}`}>
                    <input type="range" min={0.05} max={0.45} step={0.005} value={form.lensLeftX} onChange={(e) => set("lensLeftX", Number(e.target.value))} className="w-full" />
                  </Field>
                  <Field label={`مركز العدسة اليمنى: ${form.lensRightX.toFixed(3)}`}>
                    <input type="range" min={0.55} max={0.95} step={0.005} value={form.lensRightX} onChange={(e) => set("lensRightX", Number(e.target.value))} className="w-full" />
                  </Field>
                  <Field label={`خط العدسات العمودي: ${form.lensY.toFixed(3)}`}>
                    <input type="range" min={0.2} max={0.8} step={0.005} value={form.lensY} onChange={(e) => set("lensY", Number(e.target.value))} className="w-full" />
                  </Field>
                </div>
              </div>
            )}

            <hr className="my-6 border-line" />
            <h3 className="mb-2 text-sm font-bold text-ink">صور جانبية (اختياري)</h3>
            <p className="mb-3 text-xs leading-6 text-muted">
              صورة من الجانب الأيسر والأيمن (الذراع ظاهرة) — عند تجربة النظارة، إذا حرّك العميل
              رأسه بزاوية تظهر هذه الصورة بدل عرض واجهة النظارة فقط. صوّرهما بنفس الإضاءة والمسافة
              والخلفية التي صوّرت بها صورة الأمام، وبزاوية دوران حوالي 35-45 درجة.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <SidePhotoField
                label="الجانب الأيسر"
                value={
                  form.leftImage
                    ? { dataUrl: form.leftImage, anchorX: form.leftAnchorX, anchorY: form.leftAnchorY, aspect: form.leftAspect }
                    : null
                }
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    leftImage: v?.dataUrl ?? "",
                    leftAnchorX: v?.anchorX ?? EMPTY.leftAnchorX,
                    leftAnchorY: v?.anchorY ?? EMPTY.leftAnchorY,
                    leftAspect: v?.aspect ?? EMPTY.leftAspect,
                  }))
                }
              />
              <SidePhotoField
                label="الجانب الأيمن"
                value={
                  form.rightImage
                    ? { dataUrl: form.rightImage, anchorX: form.rightAnchorX, anchorY: form.rightAnchorY, aspect: form.rightAspect }
                    : null
                }
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    rightImage: v?.dataUrl ?? "",
                    rightAnchorX: v?.anchorX ?? EMPTY.rightAnchorX,
                    rightAnchorY: v?.anchorY ?? EMPTY.rightAnchorY,
                    rightAspect: v?.aspect ?? EMPTY.rightAspect,
                  }))
                }
              />
            </div>

            <hr className="my-6 border-line" />
            <Model3dField
              value={form.model3d}
              onChange={(v) => set("model3d", v)}
              hideLenses={form.hideLenses}
              onHideLensesChange={(v) => set("hideLenses", v)}
              onError={(text) => setMessage({ kind: "error", text })}
              currentImage={form.overlayImage}
              onThumbnail={({ dataUrl, geometry }) =>
                // The renderer reports where the lenses actually landed, so
                // the flat overlay lines up on the eyes without hand-tuning.
                setForm((f) => ({
                  ...f,
                  overlayImage: dataUrl,
                  lensLeftX: geometry.lensLeftX,
                  lensRightX: geometry.lensRightX,
                  lensY: geometry.lensY,
                  imageAspect: geometry.aspect,
                }))
              }
            />

            <hr className="my-6 border-line" />
            <h3 className="mb-4 text-sm font-bold text-ink">ضبط الموضع على الوجه</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`الحجم: ${form.scale.toFixed(2)}`}>
                <input type="range" min={0.7} max={1.4} step={0.01} value={form.scale} onChange={(e) => set("scale", Number(e.target.value))} className="w-full" />
              </Field>
              <Field label={`أعلى / أسفل: ${form.offsetY.toFixed(2)}`}>
                <input type="range" min={-0.4} max={0.5} step={0.01} value={form.offsetY} onChange={(e) => set("offsetY", Number(e.target.value))} className="w-full" />
              </Field>
              <Field label={`يمين / يسار: ${form.offsetX.toFixed(2)}`}>
                <input type="range" min={-0.3} max={0.3} step={0.01} value={form.offsetX} onChange={(e) => set("offsetX", Number(e.target.value))} className="w-full" />
              </Field>
              <Field label={`الميلان: ${form.rotationOffset}°`}>
                <input type="range" min={-15} max={15} step={1} value={form.rotationOffset} onChange={(e) => set("rotationOffset", Number(e.target.value))} className="w-full" />
              </Field>
              <Field label={`تلاشي الأذرع الجانبية: ${form.edgeFade.toFixed(2)}`}>
                <input type="range" min={0} max={0.3} step={0.01} value={form.edgeFade} onChange={(e) => set("edgeFade", Number(e.target.value))} className="w-full" />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">
              التلاشي يخفي أطراف الأذرع حتى لا تبدو معلّقة بجانب الرأس.
            </p>

            <div className="mt-5 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={form.bestseller} onChange={(e) => set("bestseller", e.target.checked)} />
                الأكثر مبيعاً
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={form.isNew} onChange={(e) => set("isNew", e.target.checked)} />
                جديد
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button variant="primary" size="md" type="submit">
                {editingId ? "حفظ التعديلات" : "إضافة النظارة"}
              </Button>
              {editingId && (
                <Button variant="ghost" size="md" type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>
                  إلغاء
                </Button>
              )}
            </div>
          </form>

          {/* Live preview */}
          <aside>
            <div className="sticky top-24 flex flex-col gap-4">
              <div className="card rounded-3xl p-5">
                <h2 className="mb-3 font-display text-base font-bold">معاينة مباشرة</h2>
                {/* Checkerboard makes transparency visible — so you can confirm
                    the white background was actually removed. */}
                <div
                  className="flex aspect-[5/4] items-center justify-center rounded-2xl p-5"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg,var(--surface-3) 25%,transparent 25%),linear-gradient(-45deg,var(--surface-3) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--surface-3) 75%),linear-gradient(-45deg,transparent 75%,var(--surface-3) 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                    backgroundColor: "var(--surface)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSrc}
                    alt="معاينة"
                    className="max-h-full w-full object-contain drop-shadow-[0_14px_22px_rgba(0,0,0,0.45)]"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-ink">
                  {form.brand || "الماركة"} — {form.name || "الموديل"}
                </p>
                <p className="text-center text-sm text-muted">
                  {form.price ? formatPrice(Number(form.price)) : "—"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {customProducts.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={exportJson} icon={<IconDownload className="h-4 w-4" />}>
                    تصدير JSON
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()}>
                  استيراد JSON
                </Button>
              </div>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
              />
            </div>
          </aside>
        </div>

        {/* Added frames */}
        <div className="mt-12">
          <h2 className="mb-4 font-display text-lg font-bold">
            النظارات المضافة {hydrated && `(${customProducts.length})`}
          </h2>

          {!hydrated ? (
            <p className="text-sm text-muted">جاري التحميل…</p>
          ) : customProducts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-surface/50 py-14 text-center">
              <p className="font-bold text-ink">لا توجد نظارات مضافة بعد</p>
              <p className="mt-1 text-sm text-muted">أضف نظارة من النموذج أعلاه.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {customProducts.map((p) => (
                <div key={p.id} className="card card-lift flex flex-col gap-3 rounded-3xl p-4">
                  <div className="flex aspect-[5/4] items-center justify-center rounded-2xl border border-line bg-surface-2 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getProductVisualSrc(p)} alt={p.name} className="max-h-full w-full object-contain" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-accent">{p.brand}</p>
                    <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                    <p className="text-xs text-muted">{formatPrice(p.price)}</p>
                  </div>
                  <div className="mt-auto flex flex-col gap-2">
                    <Button variant="primary" size="sm" onClick={() => openTryOn(p.id)} icon={<IconCamera className="h-4 w-4" />}>
                      جربها بالكاميرا
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => startEdit(p)}>
                        تعديل
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`حذف ${p.brand} ${p.name}؟`)) {
                            deleteProduct(p.id).catch((err) => console.error("[admin] delete failed", err));
                          }
                        }}
                        className="rounded-full border border-line px-3 text-xs font-bold text-danger transition hover:border-danger/50 hover:bg-danger/10"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 rounded-2xl bg-surface-2 p-5 text-sm leading-7 text-ink-soft">
          <p className="mb-1 font-bold text-ink">
            <IconGlasses className="inline h-4 w-4" /> ملاحظة
          </p>
          النظارات المضافة تُحفظ على السيرفر وتظهر لكل الزوار على أي جهاز.
          استخدم <strong>تصدير JSON</strong> لأخذ نسخة احتياطية، و<strong>استيراد JSON</strong>
          لنقل الكاتالوج إلى سيرفر آخر. راجع{" "}
          <Link href="/catalog" className="text-accent underline">الدليل في README</Link>.
        </div>
      </Container>
    </div>
  );
}

/**
 * Click-to-seed fallback for when auto-detection misses. Shows the ORIGINAL
 * uploaded photo (not the processed cutout) so clicks map to real pixel
 * positions; two clicks (left lens, then right) are reported back as
 * fractions of the photo's own width/height, which `processFrameImage`
 * re-runs its whole pipeline from — growing the actual lens region from that
 * exact point rather than only moving an alignment marker.
 */
function SeedPicker({ file, onPick }: { file: File; onPick: (seeds: ManualLensSeeds) => void }) {
  // Keyed by the file on the caller side, so a new upload remounts this
  // component with fresh state instead of needing an effect to reset `first`.
  //
  // The object URL is created AND revoked inside this one effect body,
  // rather than created via useMemo and revoked in a separate effect: dev
  // StrictMode runs an effect's mount -> cleanup -> mount again, and a
  // useMemo does not re-run on that second mount, so a URL created outside
  // the effect gets revoked by the first cleanup while still being the only
  // reference in scope, and the image fails to load.
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pairing create+revoke of a browser object URL to this effect's lifetime is the correct pattern here, not a data fetch to move into render.
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [first, setFirst] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const fx = clamp01((e.clientX - rect.left) / rect.width);
    const fy = clamp01((e.clientY - rect.top) / rect.height);

    if (!first) {
      setFirst({ x: fx, y: fy });
      return;
    }
    const point = { x: fx, y: fy };
    const [leftPt, rightPt] = point.x < first.x ? [point, first] : [first, point];
    onPick({ leftX: leftPt.x, leftY: leftPt.y, rightX: rightPt.x, rightY: rightPt.y });
    setFirst(null);
  };

  if (!src) return null;
  return (
    <div className="relative mt-3 inline-block max-w-full overflow-hidden rounded-xl border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        onClick={handleClick}
        className="block max-h-72 max-w-full cursor-crosshair select-none"
        draggable={false}
      />
      {first && (
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/40"
          style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }}
        />
      )}
    </div>
  );
}

type CropHandle = "move" | "nw" | "ne" | "sw" | "se";
/** Crop rectangle as fractions (0..1) of the working image — resolution-independent, so the rendered display size doesn't matter. */
interface CropFrac {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_CROP_FRACTION = 0.08;

/**
 * Manual trim for when automatic temple-arm removal gets it wrong. Shows the
 * background-removed photo BEFORE the arms are cropped off (`working.dataUrl`,
 * full width) with a draggable/resizable box the admin positions around just
 * the front rim; `onApply` re-runs only the final crop+fit step
 * (`finalizeFrame`) against that box, reusing everything already detected.
 */
function FrameCropTool({ working, onApply }: { working: WorkingFrame; onApply: (box: FrameBox) => void }) {
  const [box, setBox] = useState<CropFrac>(() => ({
    x: working.autoBox.x / working.width,
    y: working.autoBox.y / working.height,
    w: working.autoBox.w / working.width,
    h: working.autoBox.h / working.height,
  }));
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: CropHandle; startFrac: { x: number; y: number }; startBox: CropFrac } | null>(null);

  const fracFromEvent = (e: React.PointerEvent) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const clampBox = (b: CropFrac): CropFrac => {
    const w = clamp01WithMin(b.w, MIN_CROP_FRACTION, 1);
    const h = clamp01WithMin(b.h, MIN_CROP_FRACTION, 1);
    const x = clamp01(Math.min(b.x, 1 - w));
    const y = clamp01(Math.min(b.y, 1 - h));
    return { x, y, w, h };
  };

  // One flat handler (reading which handle was grabbed from a data attribute)
  // rather than a curried `startDrag(handle)(e) => ...` factory: a function
  // literal created fresh during render, closing over a ref, is flagged by
  // react-hooks/refs even though it only ever runs later as an event
  // callback — a single handler assigned directly avoids that ambiguity.
  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    const handle = e.currentTarget.dataset.handle as CropHandle | undefined;
    if (!handle) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { handle, startFrac: fracFromEvent(e), startBox: box };
  };

  const onMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const now = fracFromEvent(e);
    const dx = now.x - drag.startFrac.x;
    const dy = now.y - drag.startFrac.y;
    const b = { ...drag.startBox };
    if (drag.handle === "move") {
      b.x = drag.startBox.x + dx;
      b.y = drag.startBox.y + dy;
    } else {
      if (drag.handle.includes("w")) {
        b.x = drag.startBox.x + dx;
        b.w = drag.startBox.w - dx;
      }
      if (drag.handle.includes("e")) b.w = drag.startBox.w + dx;
      if (drag.handle.includes("n")) {
        b.y = drag.startBox.y + dy;
        b.h = drag.startBox.h - dy;
      }
      if (drag.handle.includes("s")) b.h = drag.startBox.h + dy;
    }
    setBox(clampBox(b));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const apply = () => {
    onApply({
      x: Math.round(box.x * working.width),
      y: Math.round(box.y * working.height),
      w: Math.round(box.w * working.width),
      h: Math.round(box.h * working.height),
    });
  };

  const handles: { key: CropHandle; cursor: string }[] = [
    { key: "nw", cursor: "nwse-resize" },
    { key: "ne", cursor: "nesw-resize" },
    { key: "sw", cursor: "nesw-resize" },
    { key: "se", cursor: "nwse-resize" },
  ];

  return (
    <div className="mt-3">
      <div
        ref={frameRef}
        className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-line"
        style={{
          aspectRatio: `${working.width} / ${working.height}`,
          backgroundImage:
            "linear-gradient(45deg,var(--surface-3) 25%,transparent 25%),linear-gradient(-45deg,var(--surface-3) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--surface-3) 75%),linear-gradient(-45deg,transparent 75%,var(--surface-3) 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
          backgroundColor: "var(--surface)",
        }}
        onPointerMove={onMove}
        onPointerUp={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={working.dataUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
        <div
          data-handle="move"
          onPointerDown={startDrag}
          className="absolute cursor-move border-2 border-accent bg-accent/10"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
        >
          {handles.map(({ key, cursor }) => (
            <span
              key={key}
              data-handle={key}
              onPointerDown={startDrag}
              className="absolute h-4 w-4 rounded-full border-2 border-accent bg-white"
              style={{
                cursor,
                left: key.includes("w") ? -8 : undefined,
                right: key.includes("e") ? -8 : undefined,
                top: key.includes("n") ? -8 : undefined,
                bottom: key.includes("s") ? -8 : undefined,
              }}
            />
          ))}
        </div>
      </div>
      <Button variant="primary" size="sm" type="button" className="mt-3" onClick={apply}>
        تطبيق القص
      </Button>
    </div>
  );
}

interface SidePhotoValue {
  dataUrl: string;
  /** Fractions of the image's own width/height — the point that aligns to the face (hinge or visible lens). */
  anchorX: number;
  anchorY: number;
  aspect: number;
}

/**
 * Upload + anchor picker for a side-profile photo (temple arm kept visible,
 * unlike the front image). Much simpler than the front pipeline: no lens
 * detection, no arm cropping, no manual crop tool — just background removal
 * and a single click to say where the frame lines up with the face. See
 * `processSideFrameImage` (lib/processFrameImage.ts) for why side photos
 * don't reuse the two-lens front pipeline.
 */
function SidePhotoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SidePhotoValue | null;
  onChange: (value: SidePhotoValue | null) => void;
}) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setError("حجم الصورة كبير. الحد الأقصى 1.5 ميغابايت.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const result = await processSideFrameImage(file);
      onChange({ dataUrl: result.dataUrl, anchorX: 0.5, anchorY: 0.5, aspect: result.width / result.height });
    } catch {
      setError("تعذّرت معالجة الصورة. جرّب صورة أخرى.");
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handlePickAnchor = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!value) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onChange({
      ...value,
      anchorX: clamp01((e.clientX - rect.left) / rect.width),
      anchorY: clamp01((e.clientY - rect.top) / rect.height),
    });
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="mb-2 text-xs font-bold text-ink-soft">{label}</p>

      {value && (
        <>
          <div
            className="relative inline-block max-w-full overflow-hidden rounded-lg"
            style={{
              backgroundImage:
                "linear-gradient(45deg,var(--surface-3) 25%,transparent 25%),linear-gradient(-45deg,var(--surface-3) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--surface-3) 75%),linear-gradient(-45deg,transparent 75%,var(--surface-3) 75%)",
              backgroundSize: "14px 14px",
              backgroundPosition: "0 0,0 7px,7px -7px,-7px 0",
              backgroundColor: "var(--surface)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.dataUrl}
              alt=""
              onClick={handlePickAnchor}
              className="block max-h-48 max-w-full cursor-crosshair select-none"
              draggable={false}
            />
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/40"
              style={{ left: `${value.anchorX * 100}%`, top: `${value.anchorY * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-muted">
            انقر على الصورة لتحديد نقطة المحاذاة (المفصلة أو العدسة الظاهرة).
          </p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        disabled={processing}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className={value ? "hidden" : "block w-full text-xs text-ink-soft file:me-2 file:rounded-full file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-xs file:font-semibold disabled:opacity-50"}
      />

      <div className="mt-2 flex flex-wrap gap-2">
        {value && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink"
            >
              تغيير الصورة
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-danger transition hover:bg-danger/10"
            >
              إزالة
            </button>
          </>
        )}
      </div>

      {processing && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-accent">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          جاري إزالة الخلفية…
        </p>
      )}
      {error && <p className="mt-2 text-[11px] font-bold text-danger">{error}</p>}
    </div>
  );
}

/**
 * A GLB of the actual frame is what makes the live try-on hold up when the
 * customer turns their head: the arms swing with the head and tuck behind the
 * ears, which no amount of tilting a flat photo can imitate. Optional — a
 * product without one still works exactly as before, from its photo.
 */
function Model3dField({
  value,
  onChange,
  onError,
  currentImage,
  onThumbnail,
  hideLenses,
  onHideLensesChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onError: (text: string) => void;
  /** The product's current picture, so a real photo is never overwritten. */
  currentImage: string;
  onThumbnail: (result: import("@/lib/threeTryOn/renderModelThumbnail").ModelThumbnail) => void;
  hideLenses: boolean;
  onHideLensesChange: (value: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  /** An uploaded model lives in the value itself; a served one is just a path. */
  const isEmbedded = value.startsWith("data:");
  /**
   * Result of the last path check, tagged with the path it was for — so a
   * stale ✓ can't linger next to a path that has since been edited.
   */
  const [checked, setChecked] = useState<{ path: string; ok: boolean; attempt: number } | null>(
    null
  );
  /**
   * Bumped to re-run the check. A model is usually added to `public/` and the
   * container rebuilt *after* the path has been typed, and without this the
   * "missing" verdict would stick until the text itself changed — telling you
   * the file is absent long after you put it there.
   */
  const [attempt, setAttempt] = useState(0);

  /**
   * Confirms the path actually resolves to a file, rather than letting a typo
   * or a model that was never copied into `public/` sail through and only
   * surface as a 404 later, inside the live try-on.
   */
  useEffect(() => {
    if (isEmbedded || !value) return;
    let cancelled = false;
    // Debounced, since this runs on every keystroke of the path.
    const timer = setTimeout(() => {
      // `no-store`: a 404 from before the model was added must not be served
      // back out of the browser cache as if it were still true.
      fetch(value, { method: "HEAD", cache: "no-store" })
        .then((res) => !cancelled && setChecked({ path: value, ok: res.ok, attempt }))
        .catch(() => !cancelled && setChecked({ path: value, ok: false, attempt }));
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, isEmbedded, attempt]);

  const pathCheck =
    isEmbedded || !value
      ? "idle"
      : checked?.path === value && checked.attempt === attempt
      ? checked.ok
        ? "ok"
        : "missing"
      : "checking";

  const [rendering, setRendering] = useState(false);

  /**
   * Renders the model into a flat picture for the product card. Without one,
   * a product whose only asset is a .glb shows the generic placeholder
   * artwork everywhere except the camera — the model is invisible in the
   * catalogue, which is where customers actually browse.
   */
  /** The last picture this field produced — the only kind it may replace on its own. */
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const imageIsOurs = !currentImage || currentImage === lastGenerated;

  const makeThumbnail = useCallback(async () => {
    if (!value) return;
    setRendering(true);
    try {
      const { renderModelThumbnail } = await import("@/lib/threeTryOn/renderModelThumbnail");
      const result = await renderModelThumbnail(value, { hideLenses });
      setLastGenerated(result.dataUrl);
      onThumbnail(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذّر توليد صورة من المجسم.");
    } finally {
      setRendering(false);
    }
  }, [value, hideLenses, onThumbnail, onError]);

  // Generate it automatically when a model resolves or the lens toggle
  // changes — but never over an uploaded photo, which beats any render.
  const autoRenderedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${value}|${hideLenses}`;
    if (pathCheck !== "ok" || !imageIsOurs || autoRenderedFor.current === key) return;
    autoRenderedFor.current = key;
    void makeThumbnail();
  }, [pathCheck, imageIsOurs, value, hideLenses, makeThumbnail]);

  const handleFile = async (file: File) => {
    if (file.size > MAX_MODEL_BYTES) {
      onError(
        `حجم المجسم كبير. الحد الأقصى ${Math.round(MAX_MODEL_BYTES / (1024 * 1024))} ميغابايت.`
      );
      return;
    }
    setReading(true);
    try {
      // Stored inline with the product, the same way photos are, so a frame
      // added here needs no server upload and no extra hosting to work.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      onChange(dataUrl);
    } catch {
      onError("تعذّر قراءة ملف المجسم.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-ink">مجسم ثلاثي الأبعاد (اختياري)</h3>
      <p className="mb-3 text-xs leading-6 text-muted">
        ملف <code>.glb</code> للنظارة. عند إضافته تُعرض النظارة في التجربة المباشرة كمجسم حقيقي
        يدور مع الرأس وتختفي أذرعه خلف الأذنين، بدل تحريك صورة مسطّحة. يجب أن يكون المجسم موجّهاً
        للأمام مع امتداد الأذرع للخلف، ومركزه بين العدستين، وعدساته شفافة أو محذوفة حتى تظهر
        عين العميل.
      </p>

      {isEmbedded && (
        <p className="mb-2 text-[11px] font-bold text-accent">
          ✓ مجسم مرفوع داخل المنتج ({Math.round(value.length / 1024)} كيلوبايت)
        </p>
      )}

      {/* The recommended route: the model is a file served by the site, and
          the product stores only its path. Nothing is embedded, so there is no
          size limit to speak of, the browser caches it, and it is fetched only
          when someone opens the try-on — not on every page load, which is what
          an embedded model costs (see lib/productStore.tsx's idbGetAll). */}
      <label className="mb-1 block text-xs font-bold text-ink-soft">
        مسار الملف على الموقع
      </label>
      <input
        type="text"
        dir="ltr"
        value={isEmbedded ? "" : value}
        placeholder="/assets/frames/wayfarer.glb"
        disabled={isEmbedded}
        onChange={(e) => onChange(e.target.value.trim())}
        className={`${inputCls} disabled:opacity-50`}
      />
      {pathCheck === "ok" && (
        <p className="mt-1 text-[11px] font-bold text-accent">✓ الملف موجود على الموقع</p>
      )}
      {pathCheck === "checking" && (
        <p className="mt-1 text-[11px] font-bold text-muted">… جاري التحقق من المسار</p>
      )}
      {pathCheck === "missing" && (
        <p className="mt-1 text-[11px] font-bold text-danger">
          ✕ لا يوجد ملف على هذا المسار. شغّل <code>npm run prepare-model</code> ثم{" "}
          <code>docker compose up -d --build web</code>، وبعدها
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mx-1 underline underline-offset-2 hover:no-underline"
          >
            أعد الفحص
          </button>
          .
        </p>
      )}

      <p className="mt-1 mb-3 text-[11px] leading-5 text-muted">
        ضع الملف في <code>public/assets/frames/</code> واكتب مساره هنا. هذي الطريقة المفضّلة —
        بلا حد للحجم، ولا تُبطّئ باقي صفحات الموقع.
      </p>

      <details className="mb-1">
        <summary className="cursor-pointer text-[11px] font-bold text-ink-soft">
          أو ارفع الملف داخل المنتج (حد {Math.round(MAX_MODEL_BYTES / (1024 * 1024))} ميغابايت)
        </summary>
        <p className="mt-2 mb-2 text-[11px] leading-5 text-muted">
          مناسب للتجربة السريعة فقط: الملف يُخزَّن داخل المنتج في هذا المتصفح، فيكبر حجمه بنحو
          الثلث، ويُقرأ عند كل تحميل صفحة.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".glb,.gltf,model/gltf-binary"
          disabled={reading}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-xs text-ink-soft file:me-2 file:rounded-full file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-xs file:font-semibold disabled:opacity-50"
        />
      </details>

      {value && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={makeThumbnail}
            disabled={rendering || pathCheck === "missing"}
            className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink disabled:opacity-50"
          >
            {rendering ? "جاري التوليد…" : "توليد صورة من المجسم"}
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-danger transition hover:bg-danger/10"
          >
            إزالة المجسم
          </button>
        </div>
      )}
      {value && (
        <p className="mt-1.5 text-[11px] leading-5 text-muted">
          بطاقة المنتج في المتجر تحتاج صورة مسطّحة — تُولَّد من المجسم تلقائياً عند إضافته،
          وتستبدلها أي صورة حقيقية ترفعها.
        </p>
      )}

      {value && (
        <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3">
          <input
            type="checkbox"
            checked={hideLenses}
            onChange={(e) => onHideLensesChange(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs leading-5">
            <span className="block font-bold text-ink">إخفاء العدسات في التجربة</span>
            <span className="text-muted">
              المجسمات المولَّدة تأتي بعدسات معتمة تخفي عين العميل. عند التفعيل تُزال العدسات
              ويبقى الإطار مفتوحاً فتظهر العين. عطّله للنظارات الشمسية حيث اللون هو المقصود.
            </span>
          </span>
        </label>
      )}

      {reading && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-accent">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          جاري قراءة الملف…
        </p>
      )}
    </div>
  );
}

type AdminSessionState = "checking" | "out" | "in" | "unconfigured";

/**
 * Password gate. The password itself is only ever checked on the server (see
 * lib/adminAuth.ts) — this just posts it and relies on the httpOnly session
 * cookie that comes back.
 */
function AdminLogin({
  state,
  onAuthenticated,
}: {
  state: AdminSessionState;
  onAuthenticated: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "تعذّر تسجيل الدخول.");
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تسجيل الدخول.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-16">
      <Container>
        <div className="mx-auto max-w-sm rounded-3xl border border-line bg-surface-2 p-6">
          <h1 className="font-display text-xl font-extrabold text-ink">لوحة إدارة النظارات</h1>

          {state === "checking" && <p className="mt-3 text-sm text-muted">جاري التحقق…</p>}

          {state === "unconfigured" && (
            <p className="mt-3 text-sm leading-6 text-danger">
              لم يتم تعيين <code>ADMIN_PASSWORD</code> على هذا السيرفر، فلوحة التحكم معطّلة.
              أضفها إلى ملف <code>.env</code> وأعد تشغيل الحاوية.
            </p>
          )}

          {(state === "out" || state === "in") && (
            <form onSubmit={submit} className="mt-4">
              <label className="block text-xs font-bold text-ink-soft">كلمة المرور</label>
              <input
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} mt-1`}
              />
              {error && <p className="mt-2 text-[11px] font-bold text-danger">{error}</p>}
              <Button type="submit" variant="primary" size="md" className="mt-4 w-full" disabled={busy}>
                {busy ? "جاري الدخول…" : "دخول"}
              </Button>
            </form>
          )}

          <Button href="/" variant="secondary" size="sm" className="mt-4 w-full">
            رجوع للمتجر
          </Button>
        </div>
      </Container>
    </div>
  );
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clamp01WithMin(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const inputCls = "field";
const colorCls = "field h-11 w-full cursor-pointer p-1";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
