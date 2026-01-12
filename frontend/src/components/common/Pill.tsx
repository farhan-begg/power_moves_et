// src/components/common/Pill.tsx
import React from "react";

export interface PillProps {
  label: string;
  value: string;
  kind: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  prefix?: string;
  className?: string;
}

const kindStyles = {
  positive: "bg-[var(--positive-bg-soft)] text-[var(--positive)] ring-[var(--positive-ring)]",
  negative: "bg-[var(--negative-bg-soft)] text-[var(--negative)] ring-[var(--negative-ring)]",
  neutral: "bg-[var(--btn-bg)] text-[var(--text-secondary)] ring-[var(--widget-ring)]",
};

/**
 * Pill/badge component for displaying labeled values with semantic coloring.
 * Theme-aware via CSS variables.
 */
export function Pill({
  label,
  value,
  kind,
  icon,
  prefix,
  className = "",
}: PillProps) {
  return (
    <div
      className={[
        "flex items-center justify-between rounded-xl px-3 py-2 md:px-3 md:py-2 ring-1",
        "shadow-inner shadow-black/5",
        kindStyles[kind],
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-shrink-0">
        {icon && (
          <span className="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-lg bg-[var(--btn-bg)] flex-shrink-0">
            {icon}
          </span>
        )}
        <span className="text-[10px] md:text-xs text-[var(--text-muted)] whitespace-nowrap">{label}</span>
      </div>
      <span className="font-mono tabular-nums text-xs md:text-sm text-[var(--text-primary)] ml-2 flex-shrink-0 truncate max-w-[50%] md:max-w-none">
        {prefix ?? ""}
        {value}
      </span>
    </div>
  );
}

export default Pill;
