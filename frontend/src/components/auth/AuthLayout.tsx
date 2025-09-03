import React from "react";
import { Link } from "react-router-dom";
import { BoltIcon } from "@heroicons/react/24/outline";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  sideContent?: React.ReactNode;
  /** Primary image (import from src/assets or /public) */
  imageUrl?: string;
  /** Optional ultra-wide (≥ 2:1 aspect) image for 21:9+ monitors */
  ultraWideImageUrl?: string;
  /** 'cover' (default) keeps the glassy vibe; 'contain' = no crop/letterbox */
  fit?: "cover" | "contain";
  /** Lock the focal point so it doesn't "drift" on ultra-wide (e.g. "center 35%") */
  imagePosition?: string;
  /** Optional: cap the visual column width on crazy-wide displays */
  maxVisualWidth?: string; // e.g. "1400px"
};

export default function AuthLayout({
  title,
  subtitle,
  children,
  sideContent,
  imageUrl = "/images/auth-hero.jpg",
  ultraWideImageUrl,                // provide a panoramic asset if you have it
  fit = "cover",
  imagePosition = "center 40%",     // keep the subject higher-in-frame by default
  maxVisualWidth,                   // omit to allow full bleed
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white relative overflow-hidden">
      {/* ambient orbs */}
      <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl bg-emerald-500/10" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full blur-3xl bg-cyan-400/10" />

      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between">
            <nav className="text-sm text-white/70">
              <Link to="/" className="hover:text-white">Back to site</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative grid lg:grid-cols-2 min-h-screen">
        {/* Visual side */}
        <div
          className="hidden lg:block relative"
          style={maxVisualWidth ? { maxWidth: maxVisualWidth } : undefined}
        >
          {sideContent ? (
            <div className="absolute inset-0">{sideContent}</div>
          ) : (
            <>
              {/* Picture element: swap to a panoramic image only on ultra-wide */}
              <picture>
                {ultraWideImageUrl && (
                  <source
                    media="(min-aspect-ratio: 2/1)"
                    srcSet={ultraWideImageUrl}
                  />
                )}
                <img
                  src={imageUrl}
                  alt=""
                  className={[
                    "absolute inset-0 w-full h-full",
                    fit === "cover" ? "object-cover" : "object-contain bg-slate-950",
                  ].join(" ")}
                  style={{ objectPosition: imagePosition }}
                />
              </picture>

              {/* gentle wash & caption */}
              <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/60 via-slate-900/30 to-transparent pointer-events-none" />
              <div className="absolute bottom-10 left-10 right-10">
                <div className="max-w-md">
                  <div className="inline-flex items-center gap-2 text-xs rounded-full bg-white/10 ring-1 ring-white/10 px-2.5 py-1.5 text-white/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    Finance, but calm.
                  </div>
                  <h2 className="mt-4 text-3xl font-bold leading-tight">
                    See your money with clarity.
                  </h2>
                  <p className="mt-2 text-white/75">
                    Unify accounts, understand patterns, and act with intent.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Form side */}
        <div className="flex items-center justify-center px-4 sm:px-6">
          <div className="w-full max-w-md">
            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-md shadow-2xl p-6 sm:p-8">
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
                {subtitle && <p className="mt-2 text-white/70 text-sm">{subtitle}</p>}
              </div>
              {children}
            </div>

            <p className="mt-6 text-center text-xs text-white/50">
              Protected by bank-grade connections and least-privilege access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
