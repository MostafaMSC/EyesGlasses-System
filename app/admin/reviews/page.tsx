"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard, AdminMessage, AdminShell } from "@/components/admin/AdminShell";
import { Tabs } from "@/components/admin/SettingsEditors";
import { Stars } from "@/components/product/ProductReviews";
import { useProductStore } from "@/lib/productStore";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";

interface Review {
  id: string;
  productId: string;
  rating: number;
  name: string;
  phone: string;
  text: string;
  image?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

const TABS = [
  { id: "pending", label: "بانتظار المراجعة" },
  { id: "approved", label: "المنشورة" },
  { id: "rejected", label: "المرفوضة" },
];

export default function AdminReviewsPage() {
  const [tab, setTab] = useState("pending");
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const { customProducts } = useProductStore();

  const load = useCallback(async (status: string) => {
    const res = await fetch(`/api/admin/reviews?status=${status}`);
    const body = (await res.json().catch(() => null)) as { reviews?: Review[] } | null;
    return body?.reviews ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(tab)
      .then((list) => !cancelled && setReviews(list))
      .catch(() => !cancelled && setReviews([]));
    return () => {
      cancelled = true;
    };
  }, [load, tab]);

  const switchTab = (next: string) => {
    setTab(next);
    setReviews(null);
  };

  const act = async (id: string, action: "approved" | "rejected" | "delete") => {
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" })
          : await fetch(`/api/admin/reviews/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: action }),
            });
      if (!res.ok) throw new Error("تعذّر تنفيذ الإجراء.");
      setReviews((list) => (list ?? []).filter((r) => r.id !== id));
      setMessage({ kind: "ok", text: action === "delete" ? "تم حذف التقييم." : action === "approved" ? "تم نشر التقييم." : "تم رفض التقييم." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "تعذّر تنفيذ الإجراء." });
    }
  };

  return (
    <AdminShell title="التقييمات" subtitle="تظهر تقييمات الزبائن في المتجر بعد موافقتك فقط.">
      <Tabs tabs={TABS} active={tab} onChange={switchTab} />
      <AdminMessage message={message} />
      <AdminCard>
        {reviews === null ? (
          <p className="text-sm text-muted">جاري التحميل…</p>
        ) : reviews.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">لا توجد تقييمات هنا.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {reviews.map((r) => {
              const product = customProducts.find((p) => p.id === r.productId);
              return (
                <li key={r.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-accent">{product ? `${product.brand} ${product.name}` : r.productId}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-ink">{r.name}</span>
                      <span className="text-xs text-muted" dir="ltr">
                        {r.phone}
                      </span>
                      <Stars value={r.rating} size="h-3.5 w-3.5" />
                      <span className="text-[11px] text-muted">{formatDate(r.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-soft">{r.text}</p>
                    {r.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" className="mt-2 h-20 rounded-xl border border-line object-cover" />
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.status !== "approved" && (
                      <Button variant="primary" size="sm" onClick={() => act(r.id, "approved")}>
                        نشر
                      </Button>
                    )}
                    {r.status !== "rejected" && (
                      <Button variant="secondary" size="sm" onClick={() => act(r.id, "rejected")}>
                        رفض
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => confirm("حذف التقييم نهائياً؟") && act(r.id, "delete")}
                      className="rounded-full border border-line px-3 text-xs font-bold text-danger transition hover:border-danger/50 hover:bg-danger/10"
                    >
                      حذف
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
    </AdminShell>
  );
}
