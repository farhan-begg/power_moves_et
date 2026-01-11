// src/components/common/Skeleton.tsx
import React from "react";

export interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton element with shimmer animation.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={["rounded bg-white/10", className].join(" ")} />;
}

export interface SkeletonCardProps {
  title?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Skeleton card with shimmer animation for loading states.
 */
export function SkeletonCard({ title, className = "", children }: SkeletonCardProps) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
        className,
      ].join(" ")}
    >
      {children || (
        <>
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-28" />
          </div>
          <Skeleton className="mt-4 h-8 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        </>
      )}

      {/* Shimmer overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="animate-[shimmer_2s_infinite] absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <style>{`@keyframes shimmer { 0% { transform: translateX(0); } 100% { transform: translateX(200%); } }`}</style>

      {title && <div className="sr-only">{title} loading</div>}
    </div>
  );
}

export default Skeleton;
