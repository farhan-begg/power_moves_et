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
  positive: "bg-emerald-400/10 text-[var(--positive)] ring-emerald-400/20",
  negative: "bg-rose-400/10 text-[var(--negative)] ring-rose-400/20",
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
        "flex items-center justify-between rounded-xl px-3 py-2 ring-1",
        "shadow-inner shadow-black/5",
        kindStyles[kind],
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--btn-bg)]">
            {icon}
          </span>
        )}
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
      </div>
      <span className="font-mono tabular-nums text-sm text-[var(--text-primary)]">
        {prefix ?? ""}
        {value}
      </span>
    </div>
  );
}

export default Pill;
