"use client";

import { useSettings } from "@/lib/settingsStore";
import { IconGlasses } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

/** The store mark: the uploaded logo when there is one, the built-in icon otherwise. */
export function StoreLogo({ className }: { className?: string }) {
  const { settings } = useSettings();
  const logo = settings.store.logo;
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={settings.store.name}
        className={cn("h-10 w-10 shrink-0 rounded-2xl object-contain", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-contrast shadow-[0_8px_22px_-10px_var(--accent)] transition-transform duration-300 group-hover:-rotate-6",
        className
      )}
    >
      <IconGlasses className="h-5 w-5" />
    </span>
  );
}
