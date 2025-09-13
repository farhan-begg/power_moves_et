// src/components/LogoLoader.tsx
import React from "react";
import logoUrl from "../../assets/images/logoPng.png"; // adjust path to your logo


export default function LogoLoader() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950">
      {/* Centerpiece logo, scales to screen while preserving aspect */}
      <img
        src={logoUrl}
        alt="Loading"
        draggable={false}
        className="w-[min(70vw,70vh)] max-w-[92vw] max-h-[92vh] object-contain select-none animate-pulse-slow drop-shadow-neon"
      />

      {/* Bottom indeterminate rail */}
      <div className="pointer-events-none absolute left-1/2 bottom-12 -translate-x-1/2 w-[60%] max-w-xl">
        <div className="h-1.5 rounded-full bg-white/10 ring-1 ring-white/15 overflow-hidden backdrop-blur-sm">
          <div className="h-full w-2/5 animate-indeterminate-bar bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>
        {/* subtle glow */}
        <div className="mt-2 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* Keep for a11y only; not visible */}
      <span className="sr-only">Loading</span>
    </div>
  );
}