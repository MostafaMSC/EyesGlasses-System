"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Product } from "@/data/products";
import { formatDate } from "@/lib/format";
import { fileToResizedDataUrl } from "@/lib/imageResize";
import { Button } from "@/components/ui/Button";
import { IconStar } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

interface PublicReview {
  id: string;
  rating: number;
  name: string;
  text: string;
  image?: string;
  createdAt: string;
}

export function Stars({ value, size = "h-4 w-4", className }: { value: number; size?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <IconStar key={i} className={cn(size, i <= Math.round(value) ? "text-accent" : "text-line")} fill={i <= Math.round(value) ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

/** Approved reviews plus the form to leave one; new reviews wait for approval. */
export function ProductReviews({ product }: { product: Product }) {
  const [reviews, setReviews] = useState<PublicReview[] | null>(null);
  const [form, setForm] = useState({ rating: 5, name: "", phone: "", text: "", image: "" });
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reviews?productId=${encodeURIComponent(product.id)}`)
      .then((r) => r.json())
      .then((b: { reviews?: PublicReview[] }) => !cancelled && setReviews(b.reviews ?? []))
      .catch(() => !cancelled && setReviews([]));
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const average = reviews && reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, ...form, image: form.image || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "تعذّر إرسال التقييم.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال التقييم.");
      setState("idle");
    }
  };

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold text-ink">التقييمات</h2>
          {reviews && reviews.length > 0 ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
              <Stars value={average} /> {average.toFixed(1)} من 5 · {reviews.length} تقييم
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">{reviews === null ? "…" : "لا توجد تقييمات بعد — كن أول من يقيّم."}</p>
          )}
        </div>
        {!open && state !== "sent" && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            اكتب تقييمك
          </Button>
        )}
      </div>

      {state === "sent" ? (
        <p className="mt-4 rounded-2xl bg-success/10 px-4 py-3 text-sm font-bold text-success">شكراً! سيظهر تقييمك بعد مراجعته.</p>
      ) : (
        open && (
          <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-2 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">تقييمك</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} type="button" onClick={() => setForm((f) => ({ ...f, rating: i }))} aria-label={`${i} نجوم`} className="p-0.5">
                    <IconStar className={cn("h-7 w-7 transition", i <= form.rating ? "text-accent" : "text-line")} fill={i <= form.rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">الاسم</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} className="field" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">رقم الهاتف (لا يُنشر)</span>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required inputMode="tel" dir="ltr" className="field text-left" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">رأيك</span>
              <textarea value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} required minLength={5} rows={3} className="field" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">صورة (اختياري)</span>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-xs text-ink-soft file:me-2 file:rounded-full file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setForm((s) => ({ ...s, image: "" }));
                  if (f) {
                    const src = await fileToResizedDataUrl(f, 800, 0.8);
                    setForm((s) => ({ ...s, image: src }));
                  }
                }}
              />
            </label>
            {error && <p className="text-xs font-bold text-danger sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" size="md" disabled={state === "busy"}>
                {state === "busy" ? "جاري الإرسال…" : "إرسال التقييم"}
              </Button>
              <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        )
      )}

      {reviews && reviews.length > 0 && (
        <ul className="mt-5 flex flex-col divide-y divide-line">
          {reviews.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{r.name}</span>
                <span className="text-[11px] text-muted">{formatDate(r.createdAt)}</span>
              </div>
              <Stars value={r.rating} className="mt-1" size="h-3.5 w-3.5" />
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-ink-soft">{r.text}</p>
              {r.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt="" loading="lazy" className="mt-2 h-24 rounded-xl border border-line object-cover" />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
