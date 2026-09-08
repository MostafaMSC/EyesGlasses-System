"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants: Variants = {
  hidden: { opacity: 0, y: 22 },
  shown: { opacity: 1, y: 0 },
};

/**
 * Scroll-triggered fade-up. `once` + a generous negative margin means content
 * animates in slightly before it reaches the fold, and never re-hides — a
 * reveal that can un-reveal reads as a glitch on slow scrolls.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
