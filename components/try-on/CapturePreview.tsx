"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Product } from "@/data/products";
import { storeConfig } from "@/data/storeConfig";
import { Button } from "@/components/ui/Button";
import { IconShare, IconDownload, IconWhatsApp, IconGlasses } from "@/components/ui/Icons";

export function CapturePreview({
  imageDataUrl,
  product,
  onRetry,
  onOrder,
}: {
  imageDataUrl: string;
  product: Product;
  onRetry: () => void;
  onOrder: () => void;
}) {
  const [shareState, setShareState] = useState<"idle" | "shared" | "saved">("idle");

  const handleShare = async () => {
    try {
      const res = await fetch(imageDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${storeConfig.storeNameEn}-${product.slug}.png`, { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: storeConfig.storeName,
          text: `${product.brand} ${product.name} — ${storeConfig.storeName}`,
        });
        setShareState("shared");
        return;
      }
    } catch {
      // fall through to download
    }

    const link = document.createElement("a");
    link.href = imageDataUrl;
    link.download = `${storeConfig.storeNameEn}-${product.slug}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setShareState("saved");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full w-full flex-col bg-gradient-to-b from-[#0b0d14] via-[#10131c] to-[#07080d]"
    >
      <div className="relative flex-1 overflow-hidden p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageDataUrl}
          alt="نتيجة التجربة الافتراضية"
          className="h-full w-full rounded-[28px] object-contain ring-1 ring-white/10"
        />
      </div>

      <div className="safe-bottom glass-dark mx-3 mb-3 flex flex-col gap-3 rounded-[28px] p-4">
        <p className="text-center text-sm text-white/70">
          {shareState === "shared" && "تمت المشاركة بنجاح"}
          {shareState === "saved" && "تم حفظ الصورة"}
          {shareState === "idle" && `${product.brand} ${product.name}`}
        </p>
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            size="md"
            className="flex-1 !border-white/30 !bg-white/10 !text-white hover:!bg-white/20 hover:!text-white"
            onClick={onRetry}
            icon={<IconGlasses className="h-4.5 w-4.5" />}
          >
            جرب نظارة أخرى
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="flex-1 !border-white/40 !text-white hover:!bg-white hover:!text-black"
            onClick={handleShare}
            icon={shareState === "saved" ? <IconDownload className="h-4.5 w-4.5" /> : <IconShare className="h-4.5 w-4.5" />}
          >
            مشاركة
          </Button>
        </div>
        <Button variant="whatsapp" size="lg" onClick={onOrder} icon={<IconWhatsApp className="h-5 w-5" />}>
          اطلب هذه النظارة
        </Button>
      </div>
    </motion.div>
  );
}
