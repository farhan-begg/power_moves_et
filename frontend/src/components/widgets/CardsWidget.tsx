// src/components/widgets/plaid/CardsWidget.tsx
import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks/hooks";
import { fetchCards } from "../../features/plaid/plaidSlice";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

/** ---- helpers ---- **/
function money(n: number, currency: string = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

function brandStyle(name: string = "") {
  const n = name.toLowerCase();
  if (n.includes("american express") || n.includes("amex")) {
    return { bg: "from-sky-500/50 to-sky-700/60", ring: "ring-sky-300/30" };
  }
  if (n.includes("chase")) {
    return { bg: "from-blue-500/50 to-blue-700/60", ring: "ring-blue-300/30" };
  }
  if (n.includes("capital one")) {
    return { bg: "from-red-500/50 to-fuchsia-600/50", ring: "ring-fuchsia-300/30" };
  }
  if (n.includes("citi")) {
    return { bg: "from-cyan-500/50 to-blue-600/60", ring: "ring-cyan-300/30" };
  }
  if (n.includes("boa") || n.includes("bank of america")) {
    return { bg: "from-rose-500/50 to-red-700/60", ring: "ring-rose-300/30" };
  }
  if (n.includes("wells")) {
    return { bg: "from-amber-500/50 to-orange-600/60", ring: "ring-amber-300/30" };
  }
  if (n.includes("discover")) {
    return { bg: "from-orange-500/50 to-stone-700/60", ring: "ring-orange-300/30" };
  }
  if (n.includes("barclays") || n.includes("barclay")) {
    return { bg: "from-indigo-500/50 to-indigo-700/60", ring: "ring-indigo-300/30" };
  }
  // default
  return { bg: "from-slate-600/60 to-slate-800/70", ring: "ring-white/10" };
}

function maskLast4(mask?: string | number) {
  const m = String(mask ?? "").replace(/\D/g, "").slice(-4);
  return `•••• ${m || "••••"}`;
}

function utilization(current?: number, limit?: number) {
  const cur = Math.max(0, current ?? 0);
  const lim = Math.max(0, limit ?? 0);
  if (!lim) return 0;
  return Math.min(100, Math.round((cur / lim) * 100));
}

/** ---- component ---- **/
export default function CardsWidget({ className = "" }: { className?: string }) {
  const dispatch = useAppDispatch();
  const { cards, loading, error } = useAppSelector((s) => s.plaid);
  const refresh = () => dispatch(fetchCards());

  useEffect(() => {
    if (!cards?.length && !loading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
        "transition-shadow hover:shadow-2xl",
        className,
      ].join(" ")}
    >
      {/* soft header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/90">Credit cards</h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && <div className="mt-3 text-rose-300 text-sm">Failed to load: {error}</div>}

      {/* skeletons */}
      {loading && !cards?.length ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : null}

      {/* cards grid */}
      {!loading && cards?.length ? (
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((c: any) => {
            const style = brandStyle(c.name || c.officialName || "");
            const curr = c.isoCurrencyCode || "USD";
            const bal = c.currentBalance ?? 0;
            const lim = c.limit ?? c.creditLimit ?? 0; // Plaid field name varies
            const pct = utilization(bal, lim);
            const network =
              (c.subtype || c.type || "")
                .toString()
                .toUpperCase()
                .replace(/_/g, " ") || "CREDIT";

            return (
              <li
                key={c.accountId}
                className={[
                  "relative overflow-hidden rounded-2xl p-4",
                  "bg-gradient-to-br",
                  style.bg,
                  "ring-1",
                  style.ring,
                  "shadow-xl",
                ].join(" ")}
              >
                {/* decorative glows */}
                <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/20 blur-3xl opacity-20" />
                <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-black/40 blur-3xl opacity-30" />

                {/* top row */}
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-white/90 line-clamp-1">
                    {c.name || c.officialName || "Card"}
                  </div>
                  <div className="text-[11px] tracking-wide text-white/70">{network}</div>
                </div>

                {/* the “plastic” */}
                <div className="mt-3 rounded-xl bg-white/5 ring-1 ring-white/10 p-3 shadow-inner">
                  <div className="flex items-center gap-2">
                    {/* chip */}
                    <div className="h-5 w-7 rounded-sm bg-gradient-to-b from-yellow-200/80 to-yellow-500/80 ring-1 ring-yellow-100/50" />
                    <span className="text-[11px] uppercase tracking-wide text-white/60">Virtual • Secure</span>
                  </div>

                  <div className="mt-3 font-mono tabular-nums text-white/90">
                    {maskLast4(c.mask)}
                  </div>

                  <div className="mt-1 text-[11px] text-white/60">
                    {c.officialName || c.name}
                  </div>
                </div>

                {/* balance + limit */}
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-white/60">Balance</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {money(bal, curr)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-white/60">Limit</div>
                    <div className="mt-1 text-sm text-white/90">
                      {lim ? money(lim, curr) : "—"}
                    </div>
                  </div>
                </div>

                {/* utilization bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-white/70">
                    <span>Utilization</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-white/20">
                    <div
                      className="h-2 rounded-full bg-white/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && !error && (!cards || cards.length === 0) && (
        <div className="mt-4 text-xs text-white/70">No cards found.</div>
      )}
    </div>
  );
}

/** ---- skeleton ---- **/
function CardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-slate-600/60 to-slate-800/70 ring-1 ring-white/10 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 rounded bg-white/20" />
        <div className="h-2 w-10 rounded bg-white/20" />
      </div>

      <div className="mt-3 rounded-xl bg-white/10 ring-1 ring-white/10 p-3">
        <div className="h-5 w-7 rounded-sm bg-yellow-300/60" />
        <div className="mt-3 h-4 w-28 rounded bg-white/20" />
        <div className="mt-2 h-3 w-20 rounded bg-white/15" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="h-6 w-24 rounded bg-white/20" />
        <div className="h-5 w-20 rounded bg-white/20" />
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-white/20" />

      {/* shimmer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="animate-[shimmer_2s_infinite] absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(0); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
