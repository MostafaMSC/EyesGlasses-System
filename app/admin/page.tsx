"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { frameSvgDataUri, type FrameShape } from "@/lib/frameShapes";
import { getProductVisualSrc, type Availability, type Category, type Product } from "@/data/products";
import { newProductId, slugify, useProductStore } from "@/lib/productStore";
import { processFrameImage } from "@/lib/processFrameImage";
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
};

export default function AdminPage() {
  const { customProducts, addProduct, updateProduct, deleteProduct, hydrated } = useProductStore();
  const { openTryOn } = useShopUI();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.brand.trim() || !form.name.trim()) {
      setMessage({ kind: "error", text: "الماركة واسم الموديل مطلوبان." });
      return;
    }
    try {
      if (editingId) {
        updateProduct(editingId, buildProduct(editingId));
        setMessage({ kind: "ok", text: "تم تحديث النظارة." });
      } else {
        const id = newProductId();
        addProduct(buildProduct(id));
        setMessage({ kind: "ok", text: "تمت إضافة النظارة. تقدر تجربها بالكاميرا الآن." });
      }
      setForm(EMPTY);
      setEditingId(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setMessage({
        kind: "error",
        text: "تعذّر الحفظ — غالباً بسبب حجم الصورة. جرّب صورة أصغر.",
      });
    }
  };

  const handleImage = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setMessage({ kind: "error", text: "حجم الصورة كبير. الحد الأقصى 1.5 ميغابايت." });
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      const result = await processFrameImage(file);
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

      if (result.lensesDetected) {
        setMessage({ kind: "ok", text: `تمت ${done.join("، و")} تلقائياً.` });
      } else {
        setMessage({
          kind: "warn",
          text: `تمت ${done.join("، و")}، لكن لم يتم تحديد العدسات تلقائياً. عدّل مواضع العدسات يدوياً بالأسفل.`,
        });
      }
    } catch {
      setMessage({ kind: "error", text: "تعذّرت معالجة الصورة. جرّب صورة أخرى." });
    } finally {
      setProcessing(false);
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

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">
              لوحة إدارة النظارات
            </h1>
            <p className="mt-2 text-sm text-muted">
              أضف نظارة جديدة وجربها على الكاميرا مباشرة. تُحفظ على هذا الجهاز فقط.
            </p>
          </div>
          <Button href="/catalog" variant="secondary" size="sm">
            عرض المتجر
          </Button>
        </div>

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
                  onClick={() => { set("overlayImage", ""); if (fileRef.current) fileRef.current.value = ""; }}
                  className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-danger"
                >
                  <IconClose className="h-3.5 w-3.5" /> إزالة الصورة واستخدام الرسم
                </button>
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
                  <img src={previewSrc} alt="معاينة" className="w-full drop-shadow-[0_14px_22px_rgba(0,0,0,0.45)]" />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-ink">
                  {form.brand || "الماركة"} — {form.name || "الموديل"}
                </p>
                <p className="text-center text-sm text-muted">
                  {form.price ? formatPrice(Number(form.price)) : "—"}
                </p>
              </div>

              {customProducts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={exportJson} icon={<IconDownload className="h-4 w-4" />}>
                  تصدير JSON
                </Button>
              )}
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
                    <img src={getProductVisualSrc(p)} alt={p.name} className="w-full" />
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
                          if (confirm(`حذف ${p.brand} ${p.name}؟`)) deleteProduct(p.id);
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
          النظارات المضافة تُحفظ في متصفح هذا الجهاز فقط، ولن تظهر على أجهزة أخرى. لجعلها دائمة في
          الموقع، استخدم <strong>تصدير JSON</strong> ثم أضفها إلى <code>data/products.ts</code>، أو
          راجع <Link href="/catalog" className="text-accent underline">الدليل في README</Link>.
        </div>
      </Container>
    </div>
  );
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
