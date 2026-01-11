// src/components/common/GlowBackground.tsx
import React from "react";

export interface GlowBackgroundProps {
  positive?: boolean;
  intensity?: number;
  className?: string;
}

/**
 * Decorative glow effect for cards, typically positioned in the corner.
 */
export function GlowBackground({
  positive = true,
  intensity = 0.35,
  className = "",
}: GlowBackgroundProps) {
  const gradient = positive
    ? `radial-gradient(60% 60% at 50% 50%, rgba(16,185,129,${intensity}), transparent)`
    : `radial-gradient(60% 60% at 50% 50%, rgba(244,63,94,${intensity}), transparent)`;

  return (
    <div
      className={[
        "pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-20",
        className,
      ].join(" ")}
      style={{ background: gradient }}
    />
  );
}

export default GlowBackground;
