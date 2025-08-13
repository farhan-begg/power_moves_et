import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchTransactions, Transaction } from "../../api/transaction";
import { money } from "./_utils";
import {
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

type Props = {
  title: string;
  range: { startDate: string; endDate: string };
  className?: string;
};

export default function StatCard({ title, range, className = "" }: Props) {
  const token = useSelector((s: RootState) => s.auth.token)!;

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["stats", title, range.startDate, range.endDate],
    queryFn: () => fetchTransactions(token, { ...range, page: 1, limit: 1000 }),
    enabled: !!token,
  });

  if (isLoading) return <StatCardSkeleton title={title} className={className} />;

  if (isError) {
    return (
      <div
        className={[
          "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
          className,
        ].join(" ")}
      >
        <Header title={title} range={range} />
        <div className="mt-4 text-rose-300 text-sm">Failed to load.</div>
        <button
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20"
        >
          <ArrowPathIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Retry
        </button>
      </div>
    );
  }

  const tx: Transaction[] = data?.transactions ?? [];
  const income = tx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = tx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = income - expense;
  const flow = income + expense;
  const spendPct = flow > 0 ? Math.min(100, Math.round((expense / flow) * 100)) : 0;

  const netPositive = net >= 0;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
        "transition-shadow hover:shadow-2xl",
        className,
      ].join(" ")}
    >
      {/* soft radial glow */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-20"
        style={{
          background:
            netPositive
              ? "radial-gradient(60% 60% at 50% 50%, rgba(16,185,129,.35), transparent)"
              : "radial-gradient(60% 60% at 50% 50%, rgba(244,63,94,.35), transparent)",
        }}
      />

      <Header title={title} range={range} />

      {/* Big net number */}
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/60">Net</div>
          <div
            className={[
              "mt-1 font-semibold font-mono tabular-nums text-3xl",
              netPositive ? "text-emerald-300" : "text-rose-300",
            ].join(" ")}
          >
            {netPositive ? "+" : "-"}
            {money(Math.abs(net))}
          </div>
        </div>

        {/* spend vs income meter */}
        <div className="w-40">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>Spend</span>
            <span>{spendPct}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-rose-400/70"
              style={{ width: `${spendPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Pills row */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Pill
          icon={<ArrowUpRightIcon className="h-4 w-4" />}
          label="Income"
          value={money(income)}
          className="bg-emerald-400/10 text-emerald-200 ring-emerald-400/20"
        />
        <Pill
          icon={<ArrowDownRightIcon className="h-4 w-4" />}
          label="Expense"
          value={money(expense)}
          className="bg-rose-400/10 text-rose-200 ring-rose-400/20"
          prefix="-"
        />
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Header({ title, range }: { title: string; range: { startDate: string; endDate: string } }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-medium text-white/90">{title}</h3>
      <div className="text-[11px] text-white/50">
        {range.startDate} — {range.endDate}
      </div>
    </div>
  );
}

function Pill({
  icon,
  label,
  value,
  className,
  prefix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
  prefix?: string;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between rounded-xl px-3 py-2 ring-1",
        "shadow-inner shadow-black/5",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
          {icon}
        </span>
        <span className="text-xs text-white/70">{label}</span>
      </div>
      <span className="font-mono tabular-nums text-sm text-white">
        {prefix ?? ""}
        {value}
      </span>
    </div>
  );
}

function StatCardSkeleton({ title, className = "" }: { title: string; className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
        className,
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between">
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="h-2 w-28 rounded bg-white/10" />
      </div>

      <div className="mt-4 h-8 w-40 rounded bg-white/10" />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="h-10 rounded-xl bg-white/10" />
        <div className="h-10 rounded-xl bg-white/10" />
      </div>

      {/* shimmer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="animate-[shimmer_2s_infinite] absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(0); }
          100% { transform: translateX(200%); }
        }
      `}</style>
      <div className="sr-only">{title} loading</div>
    </div>
  );
}
