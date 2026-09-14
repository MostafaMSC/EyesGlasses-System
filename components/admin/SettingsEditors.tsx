"use client";

import { useRef, type ReactNode } from "react";
import { AdminCard, AdminField, adminInput, AdminMessage } from "@/components/admin/AdminShell";
import { fileToResizedDataUrl } from "@/lib/imageResize";
import { Button } from "@/components/ui/Button";
import { IconClose, IconPlus, IconTrash, IconUpload } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

/** Header of every settings editor: message + save button. */
export function SaveBar({
  saving,
  dirty,
  onSave,
  message,
}: {
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  message: { kind: "ok" | "warn" | "error"; text: string } | null;
}) {
  return (
    <div className="sticky top-16 z-30 -mx-1 mb-4 rounded-2xl bg-bg/90 px-1 py-2 backdrop-blur">
      <AdminMessage message={message} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{dirty ? "لديك تغييرات غير محفوظة." : "كل التغييرات محفوظة."}</p>
        <Button variant="primary" size="md" onClick={onSave} disabled={saving || !dirty}>
          {saving ? "جاري الحفظ…" : "حفظ التغييرات"}
        </Button>
      </div>
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  hint,
  placeholder,
  dir,
  type = "text",
  className,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  dir?: "ltr" | "rtl";
  type?: string;
  className?: string;
}) {
  return (
    <AdminField label={label} hint={hint} className={className}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={dir} className={cn(adminInput, dir === "ltr" && "text-left")} />
    </AdminField>
  );
}

export function TextArea({ label, value, onChange, rows = 3, hint, className }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; className?: string }) {
  return (
    <AdminField label={label} hint={hint} className={className}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={adminInput} />
    </AdminField>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Picture field: stored inline as a resized data URL; served as an asset URL. */
export function ImageInput({ label, value, onChange, hint, maxWidth = 1600 }: { label: string; value: string; onChange: (v: string) => void; hint?: string; maxWidth?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-20 w-28 rounded-xl border border-line bg-surface-2 object-contain p-1" />
            <button type="button" onClick={() => onChange("")} aria-label="حذف الصورة" className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white">
              <IconClose className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="flex h-20 w-28 items-center justify-center rounded-xl border border-dashed border-line text-[11px] text-muted">لا توجد صورة</span>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-accent/50 hover:text-accent">
          <IconUpload className="h-4 w-4" /> {value ? "استبدال" : "رفع صورة"}
          <input
            ref={ref}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) onChange(await fileToResizedDataUrl(f, maxWidth));
              if (ref.current) ref.current.value = "";
            }}
          />
        </label>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/**
 * A list of editable rows (zones, banners, nav items…). `render` draws one
 * item's fields; the list handles add, remove and up/down reordering.
 */
export function ListEditor<T>({
  title,
  items,
  onChange,
  render,
  create,
  addLabel = "إضافة",
  summary,
}: {
  title?: string;
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, set: (patch: Partial<T>) => void, index: number) => ReactNode;
  create: () => T;
  addLabel?: string;
  /** One-line label for a collapsed row. */
  summary?: (item: T) => string;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <AdminCard
      title={title}
      actions={
        <Button variant="secondary" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => onChange([...items, create()])}>
          {addLabel}
        </Button>
      }
    >
      {items.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">لا توجد عناصر بعد.</p>}
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <details key={i} className="group rounded-2xl border border-line bg-surface-2/50 open:bg-surface-2" open={items.length <= 3}>
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-ink">
              <span className="flex-1 truncate">{summary ? summary(item) || `عنصر ${i + 1}` : `عنصر ${i + 1}`}</span>
              <span className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                <MiniButton label="أعلى" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </MiniButton>
                <MiniButton label="أسفل" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                  ↓
                </MiniButton>
                <MiniButton label="حذف" danger onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <IconTrash className="h-3.5 w-3.5" />
                </MiniButton>
              </span>
            </summary>
            <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
              {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
            </div>
          </details>
        ))}
      </div>
    </AdminCard>
  );
}

function MiniButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border text-xs transition disabled:opacity-30",
        danger ? "border-danger/30 text-danger hover:bg-danger/10" : "border-line text-ink-soft hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="hide-scrollbar mb-5 flex gap-1.5 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition",
            active === t.id ? "border-accent/50 bg-accent/12 text-accent" : "border-line text-ink-soft hover:text-ink"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
