"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { getProductVisualSrc } from "@/data/products";
import { useProductStore } from "@/lib/productStore";
import { useShopUI } from "@/context/ShopUIContext";
import { Button } from "@/components/ui/Button";
import { IconCamera, IconGlasses, IconSparkles, IconShieldCheck, IconTruck } from "@/components/ui/Icons";

const stats = [
  { value: "+٥٠٠", label: "عميل جرّب المجموعة" },
  { value: "٢٤ س", label: "رد على واتساب" },
  { value: "٣D", label: "تجربة على الوجه" },
];

export function Hero() {
  const { openTryOn } = useShopUI();
  const { products } = useProductStore();
  const heroProduct = products[0];
  const secondaryProduct = products[1] ?? products[0];
  const stageRef = useRef<HTMLDivElement>(null);

  // Pointer-driven tilt on the frame stage. Springs keep it from snapping.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-11, 11]), { stiffness: 140, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), { stiffness: 140, damping: 18 });

  const handlePointer = (e: React.PointerEvent) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  const resetPointer = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <section className="relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-14">
      {/* Ambient light */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-lines absolute inset-0" />
        <div className="aurora animate-drift -top-24 right-[-10%] h-[420px] w-[420px] bg-accent/45" />
        <div
          className="aurora animate-drift left-[-12%] top-24 h-[380px] w-[380px] bg-accent-3/40"
          style={{ animationDelay: "-6s" }}
        />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="order-2 lg:order-1"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-xs font-bold text-accent">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-accent" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <IconCamera className="h-3.5 w-3.5" /> تجربة افتراضية بالكاميرا
          </span>

          <h1 className="mt-6 font-display text-[2rem] font-extrabold leading-[1.22] text-ink sm:text-4xl lg:text-[3.25rem]">
            اختار نظارتك...
            <br />
            و<span className="text-gradient">جربها</span> قبل ما تشتريها
          </h1>

          <p className="mt-5 max-w-lg text-base leading-8 text-ink-soft sm:text-lg">
            اكتشف تشكيلتنا من النظارات وجرب الإطار على وجهك مباشرة من كاميرا موبايلك — بدون تطبيق،
            وبدون ما تطلع من البيت.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {heroProduct && (
              <Button
                variant="primary"
                size="lg"
                icon={<IconGlasses className="h-5 w-5" />}
                onClick={() => openTryOn(heroProduct.id)}
              >
                جرّب النظارة الآن
              </Button>
            )}
            <Button variant="secondary" size="lg" href="/catalog" icon={<IconSparkles className="h-5 w-5" />}>
              تصفح المجموعة
            </Button>
          </div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.08, duration: 0.5 }}
                className="border-e border-line pe-4 last:border-e-0"
              >
                <dt className="font-display text-xl font-extrabold text-ink sm:text-2xl">{s.value}</dt>
                <dd className="mt-1 text-[11px] leading-5 text-muted">{s.label}</dd>
              </motion.div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="order-1 lg:order-2"
        >
          <motion.div
            ref={stageRef}
            onPointerMove={handlePointer}
            onPointerLeave={resetPointer}
            style={{ rotateX, rotateY, transformPerspective: 1000 }}
            className="relative mx-auto aspect-square w-full max-w-md [transform-style:preserve-3d]"
          >
            <div className="absolute inset-0 rounded-[40px] border border-line bg-gradient-to-br from-surface-2 to-surface shadow-[var(--shadow-lg)]" />
            <div className="absolute inset-0 overflow-hidden rounded-[40px]">
              <div className="aurora -right-10 -top-10 h-56 w-56 bg-accent/50" />
              <div className="aurora -bottom-12 -left-6 h-48 w-48 bg-accent-3/45" />
            </div>

            {heroProduct && (
              <div className="animate-float absolute inset-x-[13%] top-[15%] aspect-[5/3]" style={{ transform: "translateZ(60px)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getProductVisualSrc(heroProduct)}
                  alt=""
                  className="h-full w-full drop-shadow-[0_24px_30px_rgba(0,0,0,0.5)]"
                />
              </div>
            )}

            {products[1] && (
              <div
                className="animate-float absolute inset-x-[22%] bottom-[15%] aspect-[5/3] opacity-90"
                style={{ animationDelay: "1.2s", transform: "translateZ(30px)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getProductVisualSrc(secondaryProduct)}
                  alt=""
                  className="h-full w-full drop-shadow-[0_18px_24px_rgba(0,0,0,0.45)]"
                />
              </div>
            )}

            {heroProduct && (
              <button
                onClick={() => openTryOn(heroProduct.id)}
                className="glass shine group absolute bottom-4 left-4 flex items-center gap-2 overflow-hidden rounded-full px-4 py-3 text-xs font-bold text-ink transition hover:border-accent/50 active:scale-95"
                style={{ transform: "translateZ(80px)" }}
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-accent" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                </span>
                جرّب على وجهك الآن
              </button>
            )}

            <span
              className="glass absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold text-ink-soft"
              style={{ transform: "translateZ(50px)" }}
            >
              <IconShieldCheck className="h-3.5 w-3.5 text-success" /> أصلية ١٠٠٪
            </span>

            <span
              // Sits just inside the stage on phones; only hangs off the edge
              // once there is gutter to hang into.
              className="glass absolute bottom-[38%] right-2 flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold text-ink-soft sm:right-[-6%]"
              style={{ transform: "translateZ(70px)" }}
            >
              <IconTruck className="h-3.5 w-3.5 text-accent" /> توصيل للعراق
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
