// src/components/widgets/IncomeExpenseChartWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchSummary, Granularity } from "../../api/transaction";
import { fetchPlaidAccounts } from "../../api/plaid";
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const glass =
  "rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type Preset = "30d" | "90d" | "ytd" | "1y" | "all";
const incomeColor = "#22c55e";
const expenseColor = "#ef4444";

function presetToRange(preset: Preset) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (preset === "all") return { endDate: end };

  if (preset === "ytd") {
    const start = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return { startDate: start, endDate: end };
  }
  if (preset === "1y") {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - 1);
    return { startDate: d.toISOString().slice(0, 10), endDate: end };
  }
  const days = preset === "30d" ? 29 : 89;
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return { startDate: d.toISOString().slice(0, 10), endDate: end };
}

/** Plugin: swap solid fills for gradients once layout is known */
const gradientPlugin: Plugin = {
  id: "applyGradientsOnce",
  afterLayout(chart) {
    const { chartArea, ctx, data } = chart as any;
    if (!chartArea) return;

    const makeGrad = (hex: string, aTop = 0.22, aBottom = 0.0) => {
      const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      const toRGBA = (h: string, a: number) => {
        const c = h.replace("#", "");
        const r = parseInt(c.slice(0, 2), 16);
        const g2 = parseInt(c.slice(2, 4), 16);
        const b = parseInt(c.slice(4, 6), 16);
        return `rgba(${r},${g2},${b},${a})`;
      };
      g.addColorStop(0, toRGBA(hex, aTop));
      g.addColorStop(1, toRGBA(hex, aBottom));
      return g;
    };

    let changed = false;
    (data.datasets || []).forEach((ds: any) => {
      if (ds._gradApplied) return;
      if (ds._baseColor) {
        ds.backgroundColor = makeGrad(ds._baseColor);
        ds._gradApplied = true;
        changed = true;
      }
    });
    if (changed) (chart as any).update("none");
  },
};

type PlaidAccount = {
  account_id?: string;
  accountId?: string;
  id?: string;
  name?: string;
  official_name?: string | null;
  subtype?: string | null;
  mask?: string | null;
};

export default function IncomeExpenseChartWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  const selectedAccountId = useSelector(
    (s: RootState) => s.accountFilter.selectedAccountId
  ); // <-- GLOBAL filter

  const [granularity, setGranularity] = React.useState<Granularity>("month");
  const [preset, setPreset] = React.useState<Preset>("90d");
  const [showIncome, setShowIncome] = React.useState(true);
  const [showExpense, setShowExpense] = React.useState(true);

  const range = React.useMemo(() => presetToRange(preset), [preset]);

  // Accounts (for label display)
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

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      "summary",
      granularity,
      preset,
      range.startDate ?? null,
      range.endDate ?? null,
      selectedAccountId ?? "", // <— react to global filter
    ],
    queryFn: ({ signal }) =>
      fetchSummary(
        token!,
        {
          granularity,
          ...(range.startDate ? { startDate: range.startDate } : {}),
          ...(range.endDate ? { endDate: range.endDate } : {}),
          ...(selectedAccountId ? { accountId: selectedAccountId } : {}), // <— pass to backend
        },
        signal
      ),
    enabled: !!token,
    placeholderData: (p) => p as any,
  });

  // 🔁 Auto-refetch when other widgets broadcast data changes
  React.useEffect(() => {
    const onChanged = () => refetch();
    window.addEventListener("data:transactions:changed", onChanged);
    window.addEventListener("data:manualassets:changed", onChanged);
    window.addEventListener("data:networth:changed", onChanged);
    return () => {
      window.removeEventListener("data:transactions:changed", onChanged);
      window.removeEventListener("data:manualassets:changed", onChanged);
      window.removeEventListener("data:networth:changed", onChanged);
    };
  }, [refetch]);

  const labels = data?.data.map((d) => d.period) ?? [];
  const incomeValues = data?.data.map((d) => d.income) ?? [];
  const expenseValues = data?.data.map((d) => d.expense) ?? [];

  const datasets: ChartData<"line">["datasets"] = [
    showIncome && {
      label: "Income",
      data: incomeValues,
      borderColor: incomeColor,
      backgroundColor: "rgba(34,197,94,0.18)",
      _baseColor: incomeColor,
      fill: true,
      tension: 0.08,
      borderWidth: 1,
      pointRadius: 1,
      pointHoverRadius: 3,
      pointHitRadius: 10,
      pointBorderWidth: 0,
      borderCapStyle: "butt",
      borderJoinStyle: "miter",
    },
    showExpense && {
      label: "Expense",
      data: expenseValues,
      borderColor: expenseColor,
      backgroundColor: "rgba(239,68,68,0.18)",
      _baseColor: expenseColor,
      fill: true,
      tension: 0.08,
      borderWidth: 1,
      pointRadius: 1,
      pointHoverRadius: 3,
      pointHitRadius: 10,
      pointBorderWidth: 0,
      borderCapStyle: "butt",
      borderJoinStyle: "miter",
    },
  ].filter(Boolean) as any;

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    spanGaps: true,
    interaction: { mode: "index", intersect: false },
    elements: {
      line: { borderWidth: 1, tension: 0.08, borderCapStyle: "butt", borderJoinStyle: "miter" },
      point: { radius: 1, hoverRadius: 3, hitRadius: 10, borderWidth: 0 },
    },
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
          title: (items) => (items[0]?.label ?? "").toString(),
          label: (ctx) => `${ctx.dataset.label}: ${currency.format(Number(ctx.parsed.y) || 0)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "rgba(255,255,255,0.75)", maxRotation: 0, autoSkip: true },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
      y: {
        ticks: { color: "rgba(255,255,255,0.75)", callback: (v) => currency.format(Number(v)) },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
    },
  };

  const textBtn = "text-sm font-medium px-2 py-1 transition-colors";
  const textActive = "text-white underline underline-offset-4";
  const textInactive = "text-white/70 hover:text-white hover:underline underline-offset-4";

  return (
    <div className={glass}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Income vs Expense</h3>
          {selectedAccountId && (
            <div className="text-[11px] text-white/60">
              Account: <span className="text-white">{accMap.get(selectedAccountId) || "Selected account"}</span>
            </div>
          )}
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
            {(["30d", "90d", "ytd", "1y", "all"] as Preset[]).map((p) => (
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

      <div className="h-[260px]">
        {isLoading && <p className="text-white/70">Loading…</p>}
        {isError && <p className="text-rose-300">Failed to load chart.</p>}
        {!isLoading && !isError && (datasets.length === 0 ? (
          <p className="text-white/70">Select at least one series.</p>
        ) : (
          <Line data={{ labels, datasets }} options={options} plugins={[gradientPlugin]} />
        ))}
      </div>
    </div>
  );
}
