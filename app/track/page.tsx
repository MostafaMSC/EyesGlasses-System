"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { IconPackage } from "@/components/ui/Icons";

export default function TrackPage() {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = number.trim().toUpperCase();
    if (!n || !phone.trim()) return;
    router.push(`/orders/${encodeURIComponent(n)}?phone=${encodeURIComponent(phone.trim())}`);
  };

  return (
    <div className="py-12 sm:py-16">
      <Container>
        <form onSubmit={submit} className="card mx-auto max-w-md rounded-[32px] p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
            <IconPackage className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">تتبع طلبك</h1>
          <p className="mt-1 text-sm text-muted">أدخل رقم الطلب ورقم الهاتف الذي طلبت به.</p>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-xs font-bold text-ink-soft">رقم الطلب</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="AT-001234"
              dir="ltr"
              required
              className="field text-left"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-ink-soft">رقم الهاتف</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
              required
              className="field text-left"
            />
          </label>
          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full">
            عرض حالة الطلب
          </Button>
        </form>
      </Container>
    </div>
  );
}
