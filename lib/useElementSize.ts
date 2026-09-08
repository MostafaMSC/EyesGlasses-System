"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Measures an element's box size and keeps it live via ResizeObserver.
 *
 * Returns a callback ref (not a RefObject) on purpose: this hook is used on
 * elements that mount/unmount conditionally while their owning component
 * stays mounted (e.g. the try-on modal's video stage, which only exists
 * while the modal is open). A plain `useRef` + `useEffect(..., [ref])` would
 * only ever run once — on the owning component's first mount, when the
 * target element doesn't exist yet — and never observe anything. A callback
 * ref re-fires every time the DOM node actually attaches or detaches.
 */
export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!el) {
      setSize({ width: 0, height: 0 });
      return;
    }

    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  return [ref, size] as const;
}
