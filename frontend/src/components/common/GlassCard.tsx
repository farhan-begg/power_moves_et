// src/components/common/GlassCard.tsx
import React from "react";

export interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: "positive" | "negative" | "none";
  glowIntensity?: number;
}

/**
 * Theme-aware card container with optional hover effects and glow.
 * Adapts to glass/light/dark themes via CSS variables.
 */
export function GlassCard({
  children,
  className = "",
  hover = false,
  glow = "none",
  glowIntensity = 0.2,
}: GlassCardProps) {
  const glowStyle =
    glow !== "none"
      ? {
          background:
            glow === "positive"
              ? `radial-gradient(60% 60% at 50% 50%, rgba(16,185,129,${0.35 * glowIntensity}), transparent)`
              : `radial-gradient(60% 60% at 50% 50%, rgba(244,63,94,${0.35 * glowIntensity}), transparent)`,
        }
      : undefined;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl p-5",
        "bg-[var(--widget-bg)] border border-[var(--widget-border)] ring-1 ring-[var(--widget-ring)]",
        hover && "transition-shadow hover:shadow-2xl",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        backdropFilter: "var(--widget-blur)",
        WebkitBackdropFilter: "var(--widget-blur)",
        boxShadow: "var(--widget-shadow)",
      }}
    >
      {glow !== "none" && (
        <div
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-20"
          style={glowStyle}
        />
      )}
      {children}
    </div>
  );
}

export default GlassCard;
