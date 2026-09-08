"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { IconMoon, IconSun } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
      title={isDark ? "الوضع الفاتح" : "الوضع الداكن"}
      className={cn(
        "group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full",
        "border border-line bg-surface-2 text-ink-soft transition duration-300",
        "hover:border-accent/60 hover:text-accent active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className
      )}
    >
      {/* Glow that blooms out of the icon on hover. */}
      <span className="pointer-events-none absolute inset-0 scale-0 rounded-full bg-accent/15 transition-transform duration-400 group-hover:scale-100" />

      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -45 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 45 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          {isDark ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
