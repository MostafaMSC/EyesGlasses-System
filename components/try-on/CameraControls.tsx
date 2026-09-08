"use client";

import { Button } from "@/components/ui/Button";
import { IconCamera, IconWhatsApp } from "@/components/ui/Icons";

export function CameraControls({
  onCapture,
  onOrder,
  disabled,
}: {
  onCapture: () => void;
  onOrder: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onCapture}
        disabled={disabled}
        aria-label="التقاط صورة"
        className="group relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40"
        style={{
          background: "rgba(255, 255, 255, 0.16)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(255,255,255,0.45)",
        }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0e1117] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] transition group-hover:bg-[#f2f4fa]">
          <IconCamera className="h-5 w-5" />
        </span>
      </button>

      <Button
        variant="whatsapp"
        size="md"
        className="h-[58px] flex-1 rounded-full"
        onClick={onOrder}
        icon={<IconWhatsApp className="h-5 w-5" />}
      >
        اطلب هذه النظارة
      </Button>
    </div>
  );
}
