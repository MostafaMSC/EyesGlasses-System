"use client";

import { useRef } from "react";
import {
  galleryKindLabel,
  genderLabel,
  materialLabel,
  sizeLabel,
  type EyewearSpecs,
  type FrameMaterial,
  type FrameSize,
  type GalleryImage,
  type GalleryKind,
  type Gender,
  type Product,
} from "@/data/products";
import { useCategories } from "@/lib/settingsStore";
import { fileToResizedDataUrl } from "@/lib/imageResize";
import { IconClose, IconUpload } from "@/components/ui/Icons";

/**
 * The shop-side fields of a product — pricing, stock, gallery, eyewear
 * specifications, SEO — as a block the admin form drops in. The form's own
 * state keeps these under `commerce`, and `commerceToProduct` /
 * `productToCommerce` move them to and from the stored product.
 */
export interface CommerceFormState {
  category: string;
  sku: string;
  shortDescription: string;
  compareAtPrice: string;
  stock: string;
  lowStockThreshold: string;
  active: boolean;
  tryOnEnabled: boolean;
  featured: boolean;
  gallery: GalleryImage[];
  material: FrameMaterial | "";
  gender: Gender | "";
  size: FrameSize | "";
  colorName: string;
  lensWidth: string;
  lensHeight: string;
  bridgeWidth: string;
  templeLength: string;
  frameWidth: string;
  weight: string;
  uvProtection: boolean;
  prescriptionCompatible: boolean;
  lensCompatibility: string;
  seoTitle: string;
  seoDescription: string;
}

export const EMPTY_COMMERCE: CommerceFormState = {
  category: "optical",
  sku: "",
  shortDescription: "",
  compareAtPrice: "",
  stock: "",
  lowStockThreshold: "3",
  active: true,
  tryOnEnabled: true,
  featured: false,
  gallery: [],
  material: "",
  gender: "",
  size: "",
  colorName: "",
  lensWidth: "",
  lensHeight: "",
  bridgeWidth: "",
  templeLength: "",
  frameWidth: "",
  weight: "",
  uvProtection: false,
  prescriptionCompatible: false,
  lensCompatibility: "",
  seoTitle: "",
  seoDescription: "",
};

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

export function productToCommerce(p: Product): CommerceFormState {
  const s = p.specs ?? {};
  const d = s.dimensions ?? {};
  return {
    category: p.category,
    sku: p.sku ?? "",
    shortDescription: p.shortDescription ?? "",
    compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : "",
    stock: typeof p.stock === "number" ? String(p.stock) : "",
    lowStockThreshold: typeof p.lowStockThreshold === "number" ? String(p.lowStockThreshold) : "3",
    active: p.active !== false,
    tryOnEnabled: p.tryOnEnabled !== false,
    featured: Boolean(p.featured),
    gallery: p.gallery ? p.gallery.map((g) => ({ ...g })) : [],
    material: s.material ?? "",
    gender: s.gender ?? "",
    size: s.size ?? "",
    colorName: s.colorName ?? "",
    lensWidth: d.lensWidth ? String(d.lensWidth) : "",
    lensHeight: d.lensHeight ? String(d.lensHeight) : "",
    bridgeWidth: d.bridgeWidth ? String(d.bridgeWidth) : "",
    templeLength: d.templeLength ? String(d.templeLength) : "",
    frameWidth: d.frameWidth ? String(d.frameWidth) : "",
    weight: d.weight ? String(d.weight) : "",
    uvProtection: Boolean(s.uvProtection),
    prescriptionCompatible: Boolean(s.prescriptionCompatible),
    lensCompatibility: s.lensCompatibility ?? "",
    seoTitle: p.seo?.title ?? "",
    seoDescription: p.seo?.description ?? "",
  };
}

/** The product fields these form values produce (merged over the rest). */
export function commerceToProduct(c: CommerceFormState): Partial<Product> {
  const dimensions = {
    lensWidth: num(c.lensWidth),
    lensHeight: num(c.lensHeight),
    bridgeWidth: num(c.bridgeWidth),
    templeLength: num(c.templeLength),
    frameWidth: num(c.frameWidth),
    weight: num(c.weight),
  };
  const specs: EyewearSpecs = {
    material: c.material || undefined,
    gender: c.gender || undefined,
    size: c.size || undefined,
    colorName: c.colorName.trim() || undefined,
    dimensions: Object.values(dimensions).some((v) => v !== undefined) ? dimensions : undefined,
    uvProtection: c.uvProtection || undefined,
    prescriptionCompatible: c.prescriptionCompatible || undefined,
    lensCompatibility: c.lensCompatibility.trim() || undefined,
  };
  return {
    category: c.category,
    sku: c.sku.trim() || undefined,
    shortDescription: c.shortDescription.trim() || undefined,
    compareAtPrice: num(c.compareAtPrice),
    stock: num(c.stock),
    lowStockThreshold: num(c.lowStockThreshold),
    active: c.active,
    tryOnEnabled: c.tryOnEnabled,
    featured: c.featured,
    gallery: c.gallery.length ? c.gallery : undefined,
    specs: Object.values(specs).some((v) => v !== undefined) ? specs : undefined,
    seo: c.seoTitle.trim() || c.seoDescription.trim() ? { title: c.seoTitle.trim() || undefined, description: c.seoDescription.trim() || undefined } : undefined,
  };
}

const GALLERY_KINDS: GalleryKind[] = ["front", "left", "right", "lifestyle", "detail"];
const inputCls = "field";

export function ProductCommerceFields({
  value,
  onChange,
  onError,
}: {
  value: CommerceFormState;
  onChange: (next: CommerceFormState) => void;
  onError: (text: string) => void;
}) {
  const categories = useCategories();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof CommerceFormState>(key: K, v: CommerceFormState[K]) => onChange({ ...value, [key]: v });

  const addPictures = async (files: FileList | null) => {
    if (!files) return;
    const next = [...value.gallery];
    for (const file of Array.from(files).slice(0, 6)) {
      try {
        const src = await fileToResizedDataUrl(file);
        // First picture is the front view unless there is one already.
        const kind: GalleryKind = next.some((g) => g.kind === "front") ? "detail" : "front";
        next.push({ kind, src });
      } catch (err) {
        onError(err instanceof Error ? err.message : "تعذّر قراءة الصورة.");
      }
    }
    onChange({ ...value, gallery: next.slice(0, 8) });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <hr className="my-6 border-line" />
      <h3 className="mb-1 text-sm font-bold text-ink">بيانات المتجر</h3>
      <p className="mb-4 text-[11px] leading-5 text-muted">السعر قبل الخصم، المخزون، الكود، والصور الإضافية التي تظهر في صفحة المنتج.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="النوع">
          <select className={inputCls} value={value.category} onChange={(e) => set("category", e.target.value)}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
            {!categories.some((c) => c.slug === value.category) && <option value={value.category}>{value.category}</option>}
          </select>
        </Field>
        <Field label="الكود / SKU">
          <input className={inputCls} value={value.sku} onChange={(e) => set("sku", e.target.value)} placeholder="RB-3025-BLK" dir="ltr" />
        </Field>
        <Field label="السعر قبل الخصم (اختياري)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="اتركه فارغاً إن لم يوجد خصم" />
        </Field>
        <Field label="المخزون (اتركه فارغاً لعدم التتبع)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.stock} onChange={(e) => set("stock", e.target.value)} placeholder="مثلاً 5" />
        </Field>
        <Field label="تنبيه انخفاض المخزون عند">
          <input className={inputCls} type="number" inputMode="numeric" value={value.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} />
        </Field>
        <Field label="وصف قصير (للبطاقة ونتائج البحث)">
          <input className={inputCls} value={value.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} maxLength={140} />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <Check checked={value.active} onChange={(v) => set("active", v)}>
          ظاهر في المتجر
        </Check>
        <Check checked={value.tryOnEnabled} onChange={(v) => set("tryOnEnabled", v)}>
          التجربة الافتراضية مفعّلة
        </Check>
        <Check checked={value.featured} onChange={(v) => set("featured", v)}>
          مميّز في الصفحة الرئيسية
        </Check>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-bold text-ink-soft">صور المنتج (أمامية، جانبية، على الوجه، تفاصيل)</p>
        <div className="flex flex-wrap gap-3">
          {value.gallery.map((g, i) => (
            <div key={i} className="relative w-28 rounded-2xl border border-line bg-surface-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.src} alt="" className="h-20 w-full rounded-xl object-contain" />
              <select
                className="field mt-2 h-8 px-1 py-0 text-[11px]"
                value={g.kind}
                onChange={(e) => {
                  const gallery = value.gallery.map((x, j) => (j === i ? { ...x, kind: e.target.value as GalleryKind } : x));
                  set("gallery", gallery);
                }}
              >
                {GALLERY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {galleryKindLabel[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => set("gallery", value.gallery.filter((_, j) => j !== i))}
                aria-label="حذف الصورة"
                className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
              >
                <IconClose className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="flex h-[136px] w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-[11px] font-bold text-muted transition hover:border-accent/50 hover:text-accent">
            <IconUpload className="h-5 w-5" />
            أضف صوراً
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPictures(e.target.files)} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted">تُصغَّر الصور تلقائياً إلى 1200 بكسل. الصورة «الأمامية» هي التي تظهر في البطاقة.</p>
      </div>

      <hr className="my-6 border-line" />
      <h3 className="mb-4 text-sm font-bold text-ink">مواصفات الإطار</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="الخامة">
          <select className={inputCls} value={value.material} onChange={(e) => set("material", e.target.value as FrameMaterial | "")}>
            <option value="">—</option>
            {(Object.keys(materialLabel) as FrameMaterial[]).map((k) => (
              <option key={k} value={k}>
                {materialLabel[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الفئة">
          <select className={inputCls} value={value.gender} onChange={(e) => set("gender", e.target.value as Gender | "")}>
            <option value="">—</option>
            {(Object.keys(genderLabel) as Gender[]).map((k) => (
              <option key={k} value={k}>
                {genderLabel[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المقاس">
          <select className={inputCls} value={value.size} onChange={(e) => set("size", e.target.value as FrameSize | "")}>
            <option value="">—</option>
            {(Object.keys(sizeLabel) as FrameSize[]).map((k) => (
              <option key={k} value={k}>
                {sizeLabel[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="عرض العدسة (ملم)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.lensWidth} onChange={(e) => set("lensWidth", e.target.value)} placeholder="52" />
        </Field>
        <Field label="عرض الجسر (ملم)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.bridgeWidth} onChange={(e) => set("bridgeWidth", e.target.value)} placeholder="18" />
        </Field>
        <Field label="طول الذراع (ملم)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.templeLength} onChange={(e) => set("templeLength", e.target.value)} placeholder="140" />
        </Field>
        <Field label="ارتفاع العدسة (ملم)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.lensHeight} onChange={(e) => set("lensHeight", e.target.value)} />
        </Field>
        <Field label="عرض الإطار الكلي (ملم)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.frameWidth} onChange={(e) => set("frameWidth", e.target.value)} />
        </Field>
        <Field label="الوزن (غم)">
          <input className={inputCls} type="number" inputMode="numeric" value={value.weight} onChange={(e) => set("weight", e.target.value)} />
        </Field>
        <Field label="العدسات المتوافقة" className="sm:col-span-3">
          <input className={inputCls} value={value.lensCompatibility} onChange={(e) => set("lensCompatibility", e.target.value)} placeholder="طبية، شمسية، بلو لايت…" />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <Check checked={value.uvProtection} onChange={(v) => set("uvProtection", v)}>
          حماية من الأشعة فوق البنفسجية
        </Check>
        <Check checked={value.prescriptionCompatible} onChange={(v) => set("prescriptionCompatible", v)}>
          يقبل عدسات طبية
        </Check>
      </div>

      <hr className="my-6 border-line" />
      <h3 className="mb-4 text-sm font-bold text-ink">تحسين محركات البحث (اختياري)</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="عنوان الصفحة">
          <input className={inputCls} value={value.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={70} />
        </Field>
        <Field label="وصف الصفحة">
          <input className={inputCls} value={value.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} maxLength={160} />
        </Field>
      </div>
    </>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
