import React from "react";
import PlaidLinkButton from "../PlaidLinkButton";
import { useQuickStats } from "../../hooks/useQuickStats";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import IncomeExpenseChartWidget from "./IncomeExpenseChartWidget";
import BankFlowWidget from "./BankFlowWidget"; // <-- add
import TransactionsListWidget from "./TransactionsListWidget";

/* ---------- Shared bits ---------- */

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function NetIcon({ value }: { value: number }) {
  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
  const color = positive
    ? "text-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/20"
    : negative
    ? "text-rose-400 bg-rose-400/10 ring-1 ring-rose-400/20"
    : "text-amber-300 bg-amber-300/10 ring-1 ring-amber-300/20";

  return (
    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${color}`}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

function Chip({
  color,
  label,
  value,
}: {
  color: "emerald" | "rose";
  label: string;
  value: number;
}) {
  const palette =
    color === "emerald"
      ? "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20"
      : "text-rose-300 bg-rose-400/10 ring-rose-400/20";

  return (
    <div className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${palette} flex items-center gap-1`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          color === "emerald" ? "bg-emerald-300" : "bg-rose-300"
        }`}
      />
      <span>{label}:</span>
      <span className="font-mono tabular-nums">{money(value)}</span>
    </div>
  );
}

function StatCard({
  label,
  net,
  income,
  expense,
}: {
  label: string;
  net: number;
  income: number;
  expense: number;
}) {
  const netColor =
    net > 0 ? "text-emerald-300" : net < 0 ? "text-rose-300" : "text-amber-300";

  return (
    <div className="rounded-2xl p-4 backdrop-blur-md bg-white/5 border border-white/10 shadow-lg ring-1 ring-white/5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60">{label}</div>
        <NetIcon value={net} />
      </div>

      <div className={`mt-2 flex items-baseline gap-2 ${netColor}`}>
        <div className="text-3xl font-semibold font-mono tabular-nums tracking-tight overflow-hidden text-ellipsis">
          {money(net)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip color="emerald" label="Income" value={income} />
        <Chip color="rose" label="Expense" value={expense} />
      </div>
    </div>
  );
}

/* ---------- Widgets ---------- */

export function PlaidConnectWidget() {
  return (
    <div className="space-y-3">
      <p className="text-white/80">Connect your bank via Plaid to sync transactions.</p>
      <PlaidLinkButton />
    </div>
  );
}

// Each of these loads once and shows just a single period:
export function TodayStatWidget() {
  const { loading, error, today } = useQuickStats();
  if (loading) return <div className="h-28 rounded-2xl bg-white/5 animate-pulse" />;
  if (error) return <div className="rounded-2xl p-4 bg-white/5 text-rose-300">Failed to load today.</div>;
  return <StatCard label="Today Net" net={today.net} income={today.income} expense={today.expense} />;
}

export function MonthStatWidget() {
  const { loading, error, month } = useQuickStats();
  if (loading) return <div className="h-28 rounded-2xl bg-white/5 animate-pulse" />;
  if (error) return <div className="rounded-2xl p-4 bg-white/5 text-rose-300">Failed to load month.</div>;
  return (
    <StatCard label="This Month Net" net={month.net} income={month.income} expense={month.expense} />
  );
}

export function YearStatWidget() {
  const { loading, error, year } = useQuickStats();
  if (loading) return <div className="h-28 rounded-2xl bg-white/5 animate-pulse" />;
  if (error) return <div className="rounded-2xl p-4 bg-white/5 text-rose-300">Failed to load YTD.</div>;
  return <StatCard label="YTD Net" net={year.net} income={year.income} expense={year.expense} />;
}

export const widgetRenderer: Record<string, React.ComponentType<{}>> = {
  "plaid-connect": PlaidConnectWidget,
  "stat-today": TodayStatWidget,
  "stat-month": MonthStatWidget,
  "stat-year": YearStatWidget,
  "income-expense-chart": IncomeExpenseChartWidget,
  "bank-flow": BankFlowWidget, // <-- add
    "transactions-list": TransactionsListWidget, 
};
