// src/components/widgets/useAutoRowSpan.ts
import * as React from "react";
import { useLayoutEffect, useState } from "react";

export default function useAutoRowSpan<T extends HTMLElement>(
  contentRef: React.RefObject<T> | React.MutableRefObject<T | null>
) {
  const [span, setSpan] = useState(20); // default so cards don't collapse

  useLayoutEffect(() => {
    const el = contentRef.current as T | null;
    if (!el) return;

    const grid = el.closest("[data-grid-root]") as HTMLElement | null;
    if (!grid) return;

    const ro = new ResizeObserver(() => {
      const style = getComputedStyle(grid);
      // grid-auto-rows must be a fixed px value (e.g. auto-rows-[12px])
      const row = parseFloat(style.getPropertyValue("grid-auto-rows")) || 12;
      const gap = parseFloat(style.getPropertyValue("row-gap")) || 0;

      const card = el.closest("[data-grid-item]") as HTMLElement | null;
      const h = (card?.offsetHeight ?? el.offsetHeight) + gap;
      const newSpan = Math.max(1, Math.ceil(h / (row + gap)));
      setSpan(newSpan);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [contentRef]);

  return span;
}
