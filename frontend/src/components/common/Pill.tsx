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
  positive: "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20",
  negative: "bg-rose-400/10 text-rose-200 ring-rose-400/20",
  neutral: "bg-white/10 text-white/80 ring-white/15",
};

/**
 * Pill/badge component for displaying labeled values with semantic coloring.
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
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
            {icon}
          </span>
        )}
        <span className="text-xs text-white/70">{label}</span>
      </div>
      <span className="font-mono tabular-nums text-sm text-white">
        {prefix ?? ""}
        {value}
      </span>
    </div>
  );
}

export default Pill;
