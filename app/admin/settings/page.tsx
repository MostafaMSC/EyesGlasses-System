"use client";

import { useState } from "react";
import { AdminCard, AdminShell } from "@/components/admin/AdminShell";
import { newId, useSettingsSection } from "@/components/admin/useSettingsSection";
import { ImageInput, ListEditor, SaveBar, Tabs, TextArea, TextInput, Toggle } from "@/components/admin/SettingsEditors";
import type { CouponType, PaymentMethodKind } from "@/data/siteSettings";
import { useProductStore } from "@/lib/productStore";
import { useCategories } from "@/lib/settingsStore";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const TABS = [
  { id: "store", label: "معلومات المتجر" },
  { id: "commerce", label: "التوصيل والدفع" },
  { id: "catalog", label: "التصنيفات والماركات" },
  { id: "promotions", label: "الكوبونات" },
];

export default function AdminSettingsPage() {
  const [tab, setTab] = useState("store");
  return (
    <AdminShell title="الإعدادات" subtitle="معلومات المتجر، التواصل، ساعات العمل، التوصيل، الدفع، التصنيفات والماركات — بدون أي تعديل في الكود.">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "store" && <StoreEditor />}
      {tab === "commerce" && <CommerceEditor />}
      {tab === "catalog" && <CatalogEditor />}
      {tab === "promotions" && <PromotionsEditor />}
    </AdminShell>
  );
}

function StoreEditor() {
  const s = useSettingsSection("store");
  if (!s.data) return <p className="text-sm text-muted">جاري التحميل…</p>;
  const d = s.data;
  return (
    <>
      <SaveBar saving={s.saving} dirty={s.dirty} onSave={s.save} message={s.message} />
      <div className="grid gap-6">
        <AdminCard title="الهوية">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="اسم المتجر" value={d.name} onChange={(v) => s.update({ name: v })} />
            <TextInput label="الاسم بالإنجليزية" value={d.nameEn} onChange={(v) => s.update({ nameEn: v })} dir="ltr" />
            <TextInput label="الشعار النصي" value={d.tagline} onChange={(v) => s.update({ tagline: v })} />
            <TextInput label="العملة (كما تظهر بعد السعر)" value={d.currency} onChange={(v) => s.update({ currency: v })} />
            <div className="sm:col-span-2">
              <ImageInput label="الشعار" value={d.logo} onChange={(v) => s.update({ logo: v })} hint="مربع، بخلفية شفافة إن أمكن. يظهر في الترويسة والتذييل." maxWidth={400} />
            </div>
          </div>
        </AdminCard>

        <AdminCard title="التواصل والروابط">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="رقم واتساب (بالصيغة الدولية بدون +)" value={d.whatsappNumber} onChange={(v) => s.update({ whatsappNumber: v.replace(/\D/g, "") })} dir="ltr" placeholder="9647701234567" hint="كل أزرار واتساب في الموقع تستخدم هذا الرقم." />
            <TextInput label="رقم الهاتف" value={d.phone} onChange={(v) => s.update({ phone: v })} dir="ltr" />
            <TextInput label="البريد الإلكتروني" value={d.email} onChange={(v) => s.update({ email: v })} dir="ltr" />
            <TextInput label="العنوان" value={d.address} onChange={(v) => s.update({ address: v })} />
            <TextInput label="رابط خرائط Google" value={d.mapsUrl} onChange={(v) => s.update({ mapsUrl: v })} dir="ltr" />
            <TextInput label="رابط إنستغرام" value={d.instagramUrl} onChange={(v) => s.update({ instagramUrl: v })} dir="ltr" />
            <TextInput label="معرّف إنستغرام (للعرض)" value={d.instagramHandle} onChange={(v) => s.update({ instagramHandle: v })} dir="ltr" placeholder="@store" />
            <TextInput label="رابط فيسبوك" value={d.facebookUrl} onChange={(v) => s.update({ facebookUrl: v })} dir="ltr" />
            <TextInput label="رابط تيك توك" value={d.tiktokUrl} onChange={(v) => s.update({ tiktokUrl: v })} dir="ltr" />
            <TextInput label="نص التوصيل (مختصر)" value={d.deliveryText} onChange={(v) => s.update({ deliveryText: v })} />
          </div>
        </AdminCard>

        <AdminCard title="ساعات العمل">
          <div className="grid gap-2">
            {d.workingHours.map((h, i) => (
              <div key={h.day} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line px-3 py-2">
                <span className="w-20 text-sm font-bold text-ink">{DAY_NAMES[h.day]}</span>
                <Toggle label="مغلق" checked={h.closed} onChange={(v) => s.update({ workingHours: d.workingHours.map((x, j) => (j === i ? { ...x, closed: v } : x)) })} />
                {!h.closed && (
                  <>
                    <input type="time" value={h.open} onChange={(e) => s.update({ workingHours: d.workingHours.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)) })} className="field w-auto" />
                    <span className="text-xs text-muted">إلى</span>
                    <input type="time" value={h.close} onChange={(e) => s.update({ workingHours: d.workingHours.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)) })} className="field w-auto" />
                  </>
                )}
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="من نحن والتذييل">
          <div className="grid gap-4">
            <TextInput label="عنوان «من نحن»" value={d.about.title} onChange={(v) => s.update({ about: { ...d.about, title: v } })} />
            <TextArea label="نبذة عن المتجر" value={d.about.text} onChange={(v) => s.update({ about: { ...d.about, text: v } })} />
            <TextArea label="قصة المتجر (اختياري)" value={d.about.story} onChange={(v) => s.update({ about: { ...d.about, story: v } })} rows={4} />
            <TextArea label="نص التذييل" value={d.footerText} onChange={(v) => s.update({ footerText: v })} rows={2} />
          </div>
        </AdminCard>

        <AdminCard title="محركات البحث (SEO)">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="عنوان الموقع" value={d.seo.title} onChange={(v) => s.update({ seo: { ...d.seo, title: v } })} />
            <TextInput label="معرّف Google Analytics (اختياري)" value={d.seo.googleAnalyticsId} onChange={(v) => s.update({ seo: { ...d.seo, googleAnalyticsId: v } })} dir="ltr" placeholder="G-XXXXXXX" />
            <TextArea label="وصف الموقع" value={d.seo.description} onChange={(v) => s.update({ seo: { ...d.seo, description: v } })} rows={2} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <ImageInput label="صورة المشاركة (Open Graph)" value={d.seo.ogImage} onChange={(v) => s.update({ seo: { ...d.seo, ogImage: v } })} hint="تظهر عند مشاركة رابط الموقع. الأفضل 1200×630." />
            </div>
          </div>
        </AdminCard>
      </div>
    </>
  );
}

function CommerceEditor() {
  const s = useSettingsSection("commerce");
  if (!s.data) return <p className="text-sm text-muted">جاري التحميل…</p>;
  const d = s.data;
  return (
    <>
      <SaveBar saving={s.saving} dirty={s.dirty} onSave={s.save} message={s.message} />
      <div className="grid gap-6">
        <AdminCard title="قواعد الطلب">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="الحد الأدنى للطلب (0 = بلا حد)" type="number" value={d.minOrderAmount} onChange={(v) => s.update({ minOrderAmount: Number(v) || 0 })} />
            <TextInput label="توصيل مجاني عند مبلغ (0 = معطّل)" type="number" value={d.freeDeliveryThreshold} onChange={(v) => s.update({ freeDeliveryThreshold: Number(v) || 0 })} />
            <TextInput label="بادئة رقم الطلب" value={d.orderPrefix} onChange={(v) => s.update({ orderPrefix: v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) })} dir="ltr" hint="مثلاً AT → AT-001234" />
          </div>
          <div className="mt-4">
            <Toggle label="السماح بالطلب عند نفاد المخزون (طلب مسبق)" checked={d.allowBackorder} onChange={(v) => s.update({ allowBackorder: v })} />
          </div>
        </AdminCard>

        <ListEditor
          title="مناطق التوصيل (المحافظات)"
          items={d.zones}
          onChange={(zones) => s.update({ zones })}
          addLabel="إضافة محافظة"
          summary={(z) => `${z.name || "محافظة"} — ${z.fee.toLocaleString("en-US")}${z.active ? "" : " (معطّلة)"}`}
          create={() => ({ id: newId("z"), name: "", fee: 5000, active: true, areas: [] })}
          render={(z, set) => (
            <>
              <TextInput label="المحافظة" value={z.name} onChange={(v) => set({ name: v })} />
              <TextInput label="أجرة التوصيل" type="number" value={z.fee} onChange={(v) => set({ fee: Number(v) || 0 })} />
              <TextInput label="المناطق (اختياري، افصل بفاصلة)" value={z.areas.join("، ")} onChange={(v) => set({ areas: v.split(/[،,]/).map((a) => a.trim()).filter(Boolean) })} className="sm:col-span-2" hint="إن تركتها فارغة يكتب الزبون منطقته بنفسه." />
              <Toggle label="التوصيل متاح" checked={z.active} onChange={(v) => set({ active: v })} />
            </>
          )}
        />

        <ListEditor
          title="طرق الدفع"
          items={d.paymentMethods}
          onChange={(paymentMethods) => s.update({ paymentMethods })}
          addLabel="إضافة طريقة"
          summary={(m) => `${m.label || "طريقة دفع"}${m.active ? "" : " (معطّلة)"}`}
          create={() => ({ id: newId("pm"), kind: "other" as PaymentMethodKind, label: "", description: "", instructions: "", active: true })}
          render={(m, set) => (
            <>
              <TextInput label="الاسم" value={m.label} onChange={(v) => set({ label: v })} />
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink-soft">النوع</span>
                <select value={m.kind} onChange={(e) => set({ kind: e.target.value as PaymentMethodKind })} className="field">
                  <option value="cod">الدفع عند الاستلام</option>
                  <option value="whatsapp">تأكيد عبر واتساب</option>
                  <option value="bank">تحويل بنكي / محفظة</option>
                  <option value="other">أخرى</option>
                </select>
              </label>
              <TextInput label="وصف قصير (يظهر عند الاختيار)" value={m.description} onChange={(v) => set({ description: v })} className="sm:col-span-2" />
              <TextArea label="تعليمات بعد الطلب (مثل رقم الحساب)" value={m.instructions} onChange={(v) => set({ instructions: v })} className="sm:col-span-2" />
              <Toggle label="مفعّلة" checked={m.active} onChange={(v) => set({ active: v })} />
            </>
          )}
        />
      </div>
    </>
  );
}

function CatalogEditor() {
  const s = useSettingsSection("catalog");
  if (!s.data) return <p className="text-sm text-muted">جاري التحميل…</p>;
  const d = s.data;
  const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    <>
      <SaveBar saving={s.saving} dirty={s.dirty} onSave={s.save} message={s.message} />
      <div className="grid gap-6">
        <ListEditor
          title="التصنيفات"
          items={d.categories}
          onChange={(categories) => s.update({ categories: categories.map((c, i) => ({ ...c, order: i + 1 })) })}
          addLabel="إضافة تصنيف"
          summary={(c) => `${c.name || "تصنيف"}${c.active ? "" : " (مخفي)"}`}
          create={() => ({ slug: "", name: "", nameEn: "", description: "", image: "", order: d.categories.length + 1, active: true })}
          render={(c, set) => (
            <>
              <TextInput label="الاسم" value={c.name} onChange={(v) => set({ name: v, slug: c.slug || slugify(v) })} />
              <TextInput label="الاسم بالإنجليزية" value={c.nameEn} onChange={(v) => set({ nameEn: v, slug: c.slug || slugify(v) })} dir="ltr" />
              <TextInput label="المعرّف في الرابط" value={c.slug} onChange={(v) => set({ slug: slugify(v) })} dir="ltr" hint="يظهر في /catalog?category=…؛ لا تغيّره بعد ربط منتجات به." />
              <TextInput label="الوصف" value={c.description} onChange={(v) => set({ description: v })} />
              <div className="sm:col-span-2">
                <ImageInput label="صورة التصنيف (اختياري)" value={c.image} onChange={(v) => set({ image: v })} maxWidth={1000} />
              </div>
              <Toggle label="ظاهر" checked={c.active} onChange={(v) => set({ active: v })} />
            </>
          )}
        />

        <ListEditor
          title="الماركات"
          items={d.brands}
          onChange={(brands) => s.update({ brands })}
          addLabel="إضافة ماركة"
          summary={(b) => `${b.name || "ماركة"}${b.active ? "" : " (مخفية)"}`}
          create={() => ({ name: "", logo: "", description: "", country: "", active: true })}
          render={(b, set) => (
            <>
              <TextInput label="الاسم" value={b.name} onChange={(v) => set({ name: v })} hint="اكتبه كما هو في المنتجات ليُربط بها." />
              <TextInput label="البلد" value={b.country} onChange={(v) => set({ country: v })} />
              <TextInput label="الوصف" value={b.description} onChange={(v) => set({ description: v })} className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <ImageInput label="الشعار" value={b.logo} onChange={(v) => set({ logo: v })} maxWidth={400} />
              </div>
              <Toggle label="ظاهرة" checked={b.active} onChange={(v) => set({ active: v })} />
            </>
          )}
        />
      </div>
    </>
  );
}

function PromotionsEditor() {
  const s = useSettingsSection("promotions");
  const { customProducts } = useProductStore();
  const categories = useCategories();
  if (!s.data) return <p className="text-sm text-muted">جاري التحميل…</p>;
  const d = s.data;
  return (
    <>
      <SaveBar saving={s.saving} dirty={s.dirty} onSave={s.save} message={s.message} />
      <ListEditor
        title="الكوبونات"
        items={d.coupons}
        onChange={(coupons) => s.update({ coupons })}
        addLabel="كوبون جديد"
        summary={(c) => `${c.code || "كوبون"} — ${c.type === "percent" ? `${c.value}%` : c.value.toLocaleString("en-US")}${c.active ? "" : " (معطّل)"}`}
        create={() => ({
          id: newId("c"),
          code: "",
          type: "percent" as CouponType,
          value: 10,
          minOrderAmount: 0,
          productIds: [],
          categorySlugs: [],
          expiresAt: "",
          maxUses: 0,
          perCustomerLimit: 0,
          active: true,
        })}
        render={(c, set) => (
          <>
            <TextInput label="الرمز" value={c.code} onChange={(v) => set({ code: v.toUpperCase().replace(/\s+/g, "") })} dir="ltr" placeholder="RAMADAN20" />
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">النوع</span>
              <select value={c.type} onChange={(e) => set({ type: e.target.value as CouponType })} className="field">
                <option value="percent">نسبة مئوية</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
            </label>
            <TextInput label={c.type === "percent" ? "النسبة %" : "المبلغ"} type="number" value={c.value} onChange={(v) => set({ value: Number(v) || 0 })} />
            <TextInput label="الحد الأدنى للطلب (0 = بلا حد)" type="number" value={c.minOrderAmount} onChange={(v) => set({ minOrderAmount: Number(v) || 0 })} />
            <TextInput label="ينتهي في" type="date" value={c.expiresAt} onChange={(v) => set({ expiresAt: v })} />
            <TextInput label="أقصى عدد استخدامات (0 = بلا حد)" type="number" value={c.maxUses} onChange={(v) => set({ maxUses: Number(v) || 0 })} />
            <TextInput label="أقصى استخدام لكل زبون (0 = بلا حد)" type="number" value={c.perCustomerLimit} onChange={(v) => set({ perCustomerLimit: Number(v) || 0 })} />
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">يقتصر على تصنيفات (اتركها فارغة لكل المنتجات)</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const on = c.categorySlugs.includes(cat.slug);
                  return (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => set({ categorySlugs: on ? c.categorySlugs.filter((x) => x !== cat.slug) : [...c.categorySlugs, cat.slug] })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-accent/50 bg-accent/12 text-accent" : "border-line text-ink-soft"}`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">يقتصر على منتجات (اتركها فارغة لكل المنتجات)</span>
              <div className="flex flex-wrap gap-2">
                {customProducts.map((p) => {
                  const on = c.productIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => set({ productIds: on ? c.productIds.filter((x) => x !== p.id) : [...c.productIds, p.id] })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-accent/50 bg-accent/12 text-accent" : "border-line text-ink-soft"}`}
                    >
                      {p.brand} {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <Toggle label="مفعّل" checked={c.active} onChange={(v) => set({ active: v })} />
          </>
        )}
      />
    </>
  );
}
