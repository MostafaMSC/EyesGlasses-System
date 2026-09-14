"use client";

import { useState } from "react";
import { AdminCard, AdminShell } from "@/components/admin/AdminShell";
import { newId, useSettingsSection } from "@/components/admin/useSettingsSection";
import { ImageInput, ListEditor, SaveBar, Tabs, TextArea, TextInput, Toggle } from "@/components/admin/SettingsEditors";
import { trustIconLabel, trustIcons } from "@/components/home/TrustSection";
import { useProductStore } from "@/lib/productStore";

const TABS = [
  { id: "homepage", label: "الصفحة الرئيسية" },
  { id: "navigation", label: "القوائم" },
  { id: "pages", label: "الصفحات" },
];

export default function AdminContentPage() {
  const [tab, setTab] = useState("homepage");
  return (
    <AdminShell title="المحتوى" subtitle="نصوص الصفحة الرئيسية والبانرات والقوائم وصفحات المعلومات — تظهر التغييرات فوراً في المتجر.">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "homepage" && <HomepageEditor />}
      {tab === "navigation" && <NavigationEditor />}
      {tab === "pages" && <PagesEditor />}
    </AdminShell>
  );
}

function HomepageEditor() {
  const s = useSettingsSection("homepage");
  const { customProducts } = useProductStore();
  if (!s.data) return <p className="text-sm text-muted">جاري التحميل…</p>;
  const d = s.data;
  const hero = d.hero;
  return (
    <>
      <SaveBar saving={s.saving} dirty={s.dirty} onSave={s.save} message={s.message} />
      <div className="grid gap-6">
        <AdminCard title="القسم الرئيسي (Hero)">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="الشارة الصغيرة" value={hero.badge} onChange={(v) => s.update({ hero: { ...hero, badge: v } })} />
            <TextInput label="العنوان" value={hero.title} onChange={(v) => s.update({ hero: { ...hero, title: v } })} />
            <TextInput label="الكلمة المميّزة" value={hero.highlight} onChange={(v) => s.update({ hero: { ...hero, highlight: v } })} hint="تظهر بلون مميّز في السطر الثاني: و«…» قبل ما تشتريها" />
            <TextInput label="نص الزر الرئيسي (التجربة)" value={hero.ctaText} onChange={(v) => s.update({ hero: { ...hero, ctaText: v } })} />
            <TextInput label="نص الزر الثانوي" value={hero.secondaryCtaText} onChange={(v) => s.update({ hero: { ...hero, secondaryCtaText: v } })} />
            <TextInput label="رابط الزر الثانوي" value={hero.secondaryCtaLink} onChange={(v) => s.update({ hero: { ...hero, secondaryCtaLink: v } })} dir="ltr" />
            <TextArea label="النص التعريفي" value={hero.subtitle} onChange={(v) => s.update({ hero: { ...hero, subtitle: v } })} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <ImageInput label="صورة القسم (اختياري)" value={hero.image} onChange={(v) => s.update({ hero: { ...hero, image: v } })} hint="إن تركتها فارغة تظهر نظارات من التشكيلة بحركة عائمة." />
            </div>
          </div>
        </AdminCard>

        <ListEditor
          title="الأرقام (الإحصائيات)"
          items={d.stats}
          onChange={(stats) => s.update({ stats })}
          addLabel="إضافة رقم"
          summary={(st) => `${st.value} — ${st.label}`}
          create={() => ({ value: "", label: "" })}
          render={(st, set) => (
            <>
              <TextInput label="القيمة" value={st.value} onChange={(v) => set({ value: v })} placeholder="+٥٠٠" />
              <TextInput label="الوصف" value={st.label} onChange={(v) => set({ label: v })} placeholder="عميل جرّب المجموعة" />
            </>
          )}
        />

        <ListEditor
          title="مزايا المتجر (شارات الثقة)"
          items={d.trust}
          onChange={(trust) => s.update({ trust: trust.map((t, i) => ({ ...t, order: i + 1 })) })}
          addLabel="إضافة ميزة"
          summary={(t) => `${t.title || "ميزة"}${t.active ? "" : " (مخفية)"}`}
          create={() => ({ id: newId("t"), icon: "gem", title: "", description: "", order: d.trust.length + 1, active: true })}
          render={(t, set) => (
            <>
              <TextInput label="العنوان" value={t.title} onChange={(v) => set({ title: v })} />
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink-soft">الأيقونة</span>
                <select value={t.icon} onChange={(e) => set({ icon: e.target.value })} className="field">
                  {Object.keys(trustIcons).map((k) => (
                    <option key={k} value={k}>
                      {trustIconLabel[k] ?? k}
                    </option>
                  ))}
                </select>
              </label>
              <TextInput label="وصف قصير (اختياري)" value={t.description} onChange={(v) => set({ description: v })} className="sm:col-span-2" />
              <Toggle label="ظاهرة" checked={t.active} onChange={(v) => set({ active: v })} />
            </>
          )}
        />

        <ListEditor
          title="البانرات الترويجية"
          items={d.banners}
          onChange={(banners) => s.update({ banners })}
          addLabel="إضافة بانر"
          summary={(b) => `${b.title || "بانر"}${b.active ? "" : " (معطّل)"}`}
          create={() => ({ id: newId("b"), title: "", description: "", image: "", ctaText: "", ctaLink: "/catalog", startsAt: "", endsAt: "", priority: 1, active: true })}
          render={(b, set) => (
            <>
              <TextInput label="العنوان" value={b.title} onChange={(v) => set({ title: v })} />
              <TextInput label="نص الزر" value={b.ctaText} onChange={(v) => set({ ctaText: v })} />
              <TextInput label="الوصف" value={b.description} onChange={(v) => set({ description: v })} className="sm:col-span-2" />
              <TextInput label="رابط الزر" value={b.ctaLink} onChange={(v) => set({ ctaLink: v })} dir="ltr" />
              <TextInput label="الأولوية (الأعلى أولاً)" type="number" value={b.priority} onChange={(v) => set({ priority: Number(v) || 0 })} />
              <TextInput label="يبدأ في" type="date" value={b.startsAt} onChange={(v) => set({ startsAt: v })} />
              <TextInput label="ينتهي في" type="date" value={b.endsAt} onChange={(v) => set({ endsAt: v })} />
              <div className="sm:col-span-2">
                <ImageInput label="صورة البانر" value={b.image} onChange={(v) => set({ image: v })} hint="عريضة، مثلاً 1600×700." />
              </div>
              <Toggle label="مفعّل" checked={b.active} onChange={(v) => set({ active: v })} />
            </>
          )}
        />

        <AdminCard title="أقسام المنتجات">
          <div className="grid gap-4">
            <div className="rounded-2xl border border-line p-4">
              <Toggle label="قسم «المميّزة / الأكثر مبيعاً»" checked={d.featured.active} onChange={(v) => s.update({ featured: { ...d.featured, active: v } })} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextInput label="العنوان" value={d.featured.title} onChange={(v) => s.update({ featured: { ...d.featured, title: v } })} />
                <TextInput label="الوصف" value={d.featured.subtitle} onChange={(v) => s.update({ featured: { ...d.featured, subtitle: v } })} />
              </div>
              <p className="mt-3 mb-1 text-xs font-bold text-ink-soft">اختيار يدوي للمنتجات (اتركه فارغاً ليعتمد على علامة «مميّز» و«الأكثر مبيعاً»)</p>
              <div className="flex flex-wrap gap-2">
                {customProducts.map((p) => {
                  const on = d.featured.productIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        s.update({
                          featured: { ...d.featured, productIds: on ? d.featured.productIds.filter((id) => id !== p.id) : [...d.featured.productIds, p.id] },
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-accent/50 bg-accent/12 text-accent" : "border-line text-ink-soft"}`}
                    >
                      {p.brand} {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <Toggle label="قسم «وصل حديثاً»" checked={d.newArrivals.active} onChange={(v) => s.update({ newArrivals: { ...d.newArrivals, active: v } })} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextInput label="العنوان" value={d.newArrivals.title} onChange={(v) => s.update({ newArrivals: { ...d.newArrivals, title: v } })} />
                <TextInput label="الوصف" value={d.newArrivals.subtitle} onChange={(v) => s.update({ newArrivals: { ...d.newArrivals, subtitle: v } })} />
              </div>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <Toggle label="قسم إنستغرام" checked={d.social.active} onChange={(v) => s.update({ social: { ...d.social, active: v } })} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextInput label="العنوان" value={d.social.title} onChange={(v) => s.update({ social: { ...d.social, title: v } })} />
                <TextInput label="السطر المميّز" value={d.social.highlight} onChange={(v) => s.update({ social: { ...d.social, highlight: v } })} />
                <TextInput label="الوصف" value={d.social.subtitle} onChange={(v) => s.update({ social: { ...d.social, subtitle: v } })} className="sm:col-span-2" />
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </>
  );
}

function NavigationEditor() {
  const s = useSettingsSection("navigation");
  if (!s.data) return <p className="text-sm text-muted">جاري التحميل…</p>;
  const d = s.data;
  const renumber = <T extends { order: number }>(items: T[]) => items.map((it, i) => ({ ...it, order: i + 1 }));
  return (
    <>
      <SaveBar saving={s.saving} dirty={s.dirty} onSave={s.save} message={s.message} />
      <div className="grid gap-6">
        <ListEditor
          title="قائمة الترويسة"
          items={d.header}
          onChange={(header) => s.update({ header: renumber(header) })}
          addLabel="إضافة رابط"
          summary={(n) => `${n.label || "رابط"} → ${n.href}${n.visible ? "" : " (مخفي)"}`}
          create={() => ({ id: newId("n"), label: "", href: "/catalog", visible: true, order: d.header.length + 1 })}
          render={(n, set) => (
            <>
              <TextInput label="النص" value={n.label} onChange={(v) => set({ label: v })} />
              <TextInput label="الرابط" value={n.href} onChange={(v) => set({ href: v })} dir="ltr" hint="مثل /catalog?category=sunglasses أو /pages/faq" />
              <Toggle label="ظاهر" checked={n.visible} onChange={(v) => set({ visible: v })} />
            </>
          )}
        />
        <ListEditor
          title="روابط التذييل"
          items={d.footer}
          onChange={(footer) => s.update({ footer: renumber(footer) })}
          addLabel="إضافة رابط"
          summary={(n) => `${n.label || "رابط"} → ${n.href}${n.visible ? "" : " (مخفي)"}`}
          create={() => ({ id: newId("f"), label: "", href: "/pages/faq", visible: true, order: d.footer.length + 1 })}
          render={(n, set) => (
            <>
              <TextInput label="النص" value={n.label} onChange={(v) => set({ label: v })} />
              <TextInput label="الرابط" value={n.href} onChange={(v) => set({ href: v })} dir="ltr" />
              <Toggle label="ظاهر" checked={n.visible} onChange={(v) => set({ visible: v })} />
            </>
          )}
        />
      </div>
    </>
  );
}

function PagesEditor() {
  const s = useSettingsSection("pages");
  if (!s.data) return <p className="text-sm text-muted">جاري التحميل…</p>;
  const d = s.data;
  const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    <>
      <SaveBar saving={s.saving} dirty={s.dirty} onSave={s.save} message={s.message} />
      <ListEditor
        title="صفحات المعلومات"
        items={d.pages}
        onChange={(pages) => s.update({ pages: pages.map((p) => ({ ...p, updatedAt: new Date().toISOString() })) })}
        addLabel="صفحة جديدة"
        summary={(p) => `${p.title || "صفحة"} — /pages/${p.slug}${p.published ? "" : " (مسودة)"}`}
        create={() => ({ slug: "", title: "", body: "", published: false, updatedAt: "" })}
        render={(p, set) => (
          <>
            <TextInput label="العنوان" value={p.title} onChange={(v) => set({ title: v })} />
            <TextInput label="المعرّف في الرابط" value={p.slug} onChange={(v) => set({ slug: slugify(v) })} dir="ltr" hint="أحرف إنجليزية وأرقام وشرطات فقط. الصفحة على /pages/المعرّف" />
            <TextArea
              label="المحتوى"
              value={p.body}
              onChange={(v) => set({ body: v })}
              rows={10}
              className="sm:col-span-2"
              hint="سطر فارغ يفصل بين الفقرات. ابدأ السطر بـ «## » لعنوان فرعي، وبـ «- » لعنصر قائمة."
            />
            <Toggle label="منشورة" checked={p.published} onChange={(v) => set({ published: v })} />
          </>
        )}
      />
    </>
  );
}
