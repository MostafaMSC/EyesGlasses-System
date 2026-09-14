"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * The page's origin ("https://shop.example") — empty during server
 * rendering and the hydration pass, so markup that embeds it (a WhatsApp
 * message with a product link) matches on both sides.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => ""
  );
}
