// src/components/widgets/IncomeExpenseChartWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts } from "../../api/plaid";
import type { ScriptableContext } from "chart.js";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData,
  Plugin,
} from "chart.js";
import { Line } from "react-chartjs-2";

// Date helpers (prevent TZ drift)
import {
  localYMD,
  toLocalYMDRange,
  toIsoStartEndExclusive,
  formatUTC_MMDDYYYY,
} from "../../helpers/date";

// Hooks wired earlier
import {
  useTxnSummary,
  useTopCategories,
  useTopMerchants,
  useLargestExpenses,
  useBurnRate,
} from "../../hooks/transactionsHooks";
import type { Granularity } from "../../api/transaction";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const glass =
  "rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type Preset = "7d" | "30d" | "90d" | "ytd" | "1y" | "all";
const green = "#22c55e";
const red = "#ef4444";
const blue = "#3b82f6";

/* ------------------------- Helpers ------------------------- */

// Range union + helpers
type LocalRange = { startDate: string; endDate: string } | { endDate: string };
function presetToLocalRange(preset: Preset): LocalRange {
  if (preset === "all") return { endDate: localYMD() };
  return toLocalYMDRange(preset);
}

// Safer number parser (no NaN)
const n = (v: any, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

// Friendly label: turn "GENERAL_SERVICES_ACCOUNTING" → "General Services · Accounting"
function prettifyName(raw: any): string {
  if (!raw) return "Unknown";
  const s = String(raw)
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!s) return "Unknown";
  const words = s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  if (words.length > 2) {
    const head = words.slice(0, -1).join(" ");
    const tail = words.slice(-1)[0];
    return `${head} · ${tail}`;
  }
  return words.join(" ");
}

// Flexible getters (handles different shapes your routes might return)
function getExpenseAmount(row: any): number {
  return (
    n(row?.spend) ||                 // your /top-merchants shape
    n(row?.expense) ||
    n(row?.expenseTotal) ||
    n(row?.totalExpense) ||
    n(row?.amount) ||
    0
  );
}
function getId(row: any): string {
  return String(row?._id ?? row?.id ?? row?.txnId ?? Math.random().toString(36).slice(2));
}
function getDesc(row: any): string {
  return prettifyName(row?.description ?? row?.name ?? row?.merchant ?? row?.category ?? "Untitled");
}
function getBurnValue(obj: any): number {
  if (!obj) return 0;
  return (
    n(obj?.projectedMonthly) || // ← your API’s main field
    n(obj?.avgDaily * 30) ||    // fallback: daily × 30
    n(obj?.total) ||
    0
  );
}

// Accounts label lookup
type PlaidAccount = {
  account_id?: string;
  accountId?: string;
  id?: string;
  name?: string;
  official_name?: string | null;
  subtype?: string | null;
  mask?: string | null;
};
const isRealAccountId = (v?: string | null) =>
  !!v && !["__all__", "all", "undefined", "null", ""].includes(String(v));

/* ------------------------- Chart Gradient Plugin ------------------------- */
const strokeGradientPlugin: Plugin = {
  id: "strokeGradient",
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, data } = chart as any;
    if (!chartArea) return;

    const makeGrad = (hex: string) => {
      const g = ctx.createLinearGradient(chartArea.left, chartArea.top, chartArea.right, chartArea.bottom);
      const c = (h: string, a: number) => {
        const c = h.replace("#", "");
        const r = parseInt(c.slice(0, 2), 16);
        const g2 = parseInt(c.slice(2, 4), 16);
        const b = parseInt(c.slice(4, 6), 16);
        return `rgba(${r},${g2},${b},${a})`;
      };
      g.addColorStop(0, c(hex, 0.35));
      g.addColorStop(0.55, c(hex, 0.95));
      g.addColorStop(1, c(hex, 0.35));
      return g;
    };

    (data.datasets || []).forEach((ds: any) => {
      if (ds._baseColor) ds.borderColor = makeGrad(ds._baseColor);
    });
  },
};

/* ------------------------- Component ------------------------- */
export default function IncomeExpenseChartWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  const selectedAccountIdRaw = useSelector((s: RootState) => s.accountFilter.selectedAccountId);

  const accountFilterId = React.useMemo(
    () => (isRealAccountId(selectedAccountIdRaw) ? selectedAccountIdRaw : undefined),
    [selectedAccountIdRaw]
  );

  const [granularity, setGranularity] = React.useState<Granularity>("month");
  const [preset, setPreset] = React.useState<Preset>("90d");
  const [showIncome, setShowIncome] = React.useState(true);
  const [showExpense, setShowExpense] = React.useState(true);

  // 1) local YMD range
  const range = React.useMemo<LocalRange>(() => presetToLocalRange(preset), [preset]);

  // 2) Convert to ISO (exclusive end) with TS-narrowing
  const isoRange = React.useMemo(() => {
    if ("startDate" in range) {
      const { startISO, endExclusiveISO } = toIsoStartEndExclusive(range.startDate, range.endDate);
      return { startISO, endExclusiveISO };
    } else {
      const { startISO, endExclusiveISO } = toIsoStartEndExclusive("1970-01-01", range.endDate);
      return { startISO, endExclusiveISO };
    }
  }, [range]);

  // Accounts for label
  const { data: accountsRaw } = useQuery<PlaidAccount[] | { accounts: PlaidAccount[] }>({
    queryKey: ["accounts"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: (p) => p as any,
  });

  const accounts = React.useMemo<PlaidAccount[]>(() => {
    const raw = accountsRaw as any;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.accounts)) return raw.accounts as PlaidAccount[];
    return [];
  }, [accountsRaw]);

  const accMap = React.useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => {
      const id = a.account_id || a.accountId || a.id;
      const label = a.name || a.official_name || a.subtype || "Account";
      if (id) m.set(id, label);
    });
    return m;
  }, [accounts]);

  /* =================== DATA =================== */
  const summaryQ = useTxnSummary({
    granularity,
    startDate: isoRange.startISO,
    endDate: isoRange.endExclusiveISO,
    ...(accountFilterId ? { accountId: accountFilterId } : {}),
  });

  const topCatsQ = useTopCategories({
    startDate: isoRange.startISO,
    endDate: isoRange.endExclusiveISO,
    limit: 5,
    ...(accountFilterId ? { accountId: accountFilterId } : {}),
  });

  const topMerchantsQ = useTopMerchants({
    startDate: isoRange.startISO,
    endDate: isoRange.endExclusiveISO,
    limit: 5,
    ...(accountFilterId ? { accountId: accountFilterId } : {}),
  });

  const largestQ = useLargestExpenses({
    startDate: isoRange.startISO,
    endDate: isoRange.endExclusiveISO,
    limit: 5,
    ...(accountFilterId ? { accountId: accountFilterId } : {}),
  });

  const burnQ = useBurnRate({
    startDate: isoRange.startISO,
    endDate: isoRange.endExclusiveISO,
    ...(accountFilterId ? { accountId: accountFilterId } : {}),
  });

  /* =================== CHART =================== */
  const labels =
    summaryQ.data?.data.map((d) => {
      const p = d?.period;
      if (typeof p === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p)) return p; // YMD
      return String(p ?? "");
    }) ?? [];

  const incomeValues = summaryQ.data?.data.map((d) => n(d.income)) ?? [];
  const expenseValues = summaryQ.data?.data.map((d) => n(d.expense)) ?? [];

  const datasets: ChartData<"line">["datasets"] = [
    showIncome && {
      label: "Income",
      data: incomeValues,
      _baseColor: green,
      borderColor: green, // replaced by plugin
      backgroundColor: (ctx: ScriptableContext<"line">) => {
        const chart = ctx.chart;
        const { ctx: c, chartArea } = chart as any;
        if (!chartArea) return "rgba(34,197,94,0.15)";
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, "rgba(34,197,94,0.22)");
        g.addColorStop(1, "rgba(34,197,94,0.02)");
        return g;
      },
      fill: true,
      tension: 0.15,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 3,
      pointHitRadius: 12,
    },
    showExpense && {
      label: "Expense",
      data: expenseValues,
      _baseColor: red,
      borderColor: red, // replaced by plugin
      backgroundColor: (ctx: ScriptableContext<"line">) => {
        const chart = ctx.chart;
        const { ctx: c, chartArea } = chart as any;
        if (!chartArea) return "rgba(239,68,68,0.15)";
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, "rgba(239,68,68,0.22)");
        g.addColorStop(1, "rgba(239,68,68,0.02)");
        return g;
      },
      fill: true,
      tension: 0.15,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 3,
      pointHitRadius: 12,
    },
  ].filter(Boolean) as any;

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    spanGaps: true,
    interaction: { mode: "index", intersect: false },
    elements: { line: { borderWidth: 2, tension: 0.15 }, point: { radius: 0, hoverRadius: 3 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderColor: "rgba(255,255,255,0.12)",
        borderWidth: 1,
        padding: 10,
        titleColor: "#fff",
        bodyColor: "rgba(255,255,255,0.9)",
        callbacks: {
          title: (items) => String(items?.[0]?.label ?? ""),
          label: (ctx) => `${ctx.dataset.label}: ${currency.format(n(ctx.parsed.y))}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: "rgba(255,255,255,0.75)" }, grid: { color: "rgba(255,255,255,0.08)" } },
      y: { ticks: { color: "rgba(255,255,255,0.75)", callback: (v) => currency.format(n(v)) }, grid: { color: "rgba(255,255,255,0.08)" } },
    },
  };

  const textBtn = "text-sm font-medium px-2 py-1 transition-colors";
  const textActive = "text-white underline underline-offset-4";
  const textInactive = "text-white/70 hover:text-white hover:underline underline-offset-4";

  /* =================== UI =================== */
  return (
    <div className={glass}>
      {/* Header & filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Income vs Expense</h3>
          {accountFilterId && (
            <div className="text-[11px] text-white/60">
              Account: <span className="text-white">{accMap.get(accountFilterId) || "Selected account"}</span>
            </div>
          )}
          <div className="text-[11px] text-white/50 mt-0.5">
            Range: {formatUTC_MMDDYYYY(isoRange.startISO)} → {formatUTC_MMDDYYYY(isoRange.endExclusiveISO)} (UTC)
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Granularity */}
          <div className="flex gap-3">
            {(["day", "month", "year"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`${textBtn} ${granularity === g ? textActive : textInactive}`}
              >
                {g === "day" ? "Daily" : g === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>

          {/* Presets */}
          <div className="flex gap-3">
            {(["7d", "30d", "90d", "ytd", "1y", "all"] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`${textBtn} ${preset === p ? textActive : textInactive}`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Toggles */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowIncome((s) => !s)}
              className={`${textBtn} ${showIncome ? textActive : textInactive}`}
              title="Toggle Income"
            >
              Income
            </button>
            <button
              onClick={() => setShowExpense((s) => !s)}
              className={`${textBtn} ${showExpense ? textActive : textInactive}`}
              title="Toggle Expense"
            >
              Expense
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[260px]">
        {summaryQ.isLoading && <p className="text-white/70">Loading…</p>}
        {summaryQ.isError && <p className="text-rose-300">Failed to load chart.</p>}
        {!summaryQ.isLoading && !summaryQ.isError && (
          (datasets.length === 0 || labels.length === 0) ? (
            <p className="text-white/70">No data for this range.</p>
          ) : (
            <Line data={{ labels, datasets }} options={options} plugins={[strokeGradientPlugin]} />
          )
        )}
      </div>

      {/* Insights grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6 text-sm">
        {/* Top Categories */}
        <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-white">Top Categories</h4>
          </div>
          <div className="space-y-2">
            {topCatsQ.isLoading && <div className="text-white/60">Loading…</div>}
            {!topCatsQ.isLoading &&
              (topCatsQ.data?.length ? (
                topCatsQ.data.map((c: any, i: number) => {
                  const amt = getExpenseAmount(c);
                  return (
                    <RowBar
                      key={getId(c)}
                      label={prettifyName(c.category ?? "Uncategorized")}
                      amount={amt}
                      rank={i + 1}
                      max={topCatsQ.data ? Math.max(...topCatsQ.data.map(getExpenseAmount)) || 1 : 1}
                      type="expense" // 🔴 premium red gradient
                    />
                  );
                })
              ) : (
                <div className="text-white/60">No expenses in this range.</div>
              ))}
          </div>
        </div>

        {/* Top Merchants */}
        <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-white">Top Merchants</h4>
          </div>
          <div className="space-y-2">
            {topMerchantsQ.isLoading && <div className="text-white/60">Loading…</div>}
            {!topMerchantsQ.isLoading &&
              (topMerchantsQ.data?.length ? (
                topMerchantsQ.data.map((m: any, i: number) => {
                  const amt = getExpenseAmount(m);
                  return (
                    <RowBar
                      key={getId(m)}
                      label={prettifyName(m.merchant ?? "Unknown")}
                      amount={amt}
                      rank={i + 1}
                      max={topMerchantsQ.data ? Math.max(...topMerchantsQ.data.map(getExpenseAmount)) || 1 : 1}
                      type="neutral" // 🔵 premium blue gradient
                    />
                  );
                })
              ) : (
                <div className="text-white/60">No merchants in this range.</div>
              ))}
          </div>
        </div>

        {/* Largest Expenses */}
        <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-3">
          <h4 className="font-semibold text-white mb-2">Largest Expenses</h4>
          <div className="space-y-1">
            {largestQ.isLoading && <div className="text-white/60">Loading…</div>}
            {!largestQ.isLoading &&
              (largestQ.data?.length ? (
                largestQ.data.map((t: any) => (
                  <div key={getId(t)} className="flex items-center justify-between">
                    <span className="text-white/80 truncate">{getDesc(t)}</span>
                    <span className="text-white/60">{currency.format(n(t?.amount))}</span>
                  </div>
                ))
              ) : (
                <div className="text-white/60">No large expenses in this range.</div>
              ))}
          </div>
        </div>

        {/* Burn Rate */}
        <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-3">
          <h4 className="font-semibold text-white mb-2">Burn Rate</h4>
          {burnQ.isLoading ? (
            <div className="text-white/60">Loading…</div>
          ) : (
            <div className="text-2xl font-semibold text-white">
              {currency.format(getBurnValue(burnQ.data))}<span className="text-white/60 text-base"> /mo</span>
            </div>
          )}
          <div className="text-[11px] text-white/50 mt-1">
            Average monthly spend across the selected range.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Small UI piece: ranked bar row ------------------------- */
function RowBar({
  label,
  amount,
  rank,
  max,
  type, // "expense" | "income" | "neutral"
}: {
  label: string;
  amount: number;
  rank: number;
  max: number;
  type: "expense" | "income" | "neutral";
}) {
  const pct = Math.max(0.02, Math.min(1, amount / Math.max(1, max)));

  // 🎨 Premium gradient palettes
  const gradientFor = (t: "expense" | "income" | "neutral") => {
    const color = t === "expense" ? red : t === "income" ? green : blue;
    return `linear-gradient(90deg, ${hexA(color, 0.35)} 0%, ${hexA(color, 0.95)} 60%, ${hexA(color, 0.35)} 100%)`;
  };

  return (
    <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
      <div className="text-white/60 text-xs w-5 text-right">{rank}</div>
      <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${pct * 100}%`,
            background: gradientFor(type),
          }}
        />
      </div>
      <div className="text-white/80 text-sm tabular-nums">{currency.format(amount)}</div>
      <div className="col-span-3 -mt-0.5 text-[11px] text-white/70 truncate">{label}</div>
    </div>
  );
}

function hexA(hex: string, a = 1) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
