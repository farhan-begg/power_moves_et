// src/components/widgets/IncomeExpenseChartWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchSummary, Granularity } from "../../api/transaction";
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
const incomeColor = "#22c55e"; // emerald-500
const expenseColor = "#ef4444"; // red-500

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

/** Plugin: once layout is known, replace solid fills with real gradients and refresh once */
const gradientPlugin: Plugin = {
  id: "applyGradientsOnce",
  afterLayout(chart, _args, _opts) {
    const { chartArea, ctx, data } = chart;
    if (!chartArea) return;

    const makeGrad = (hex: string, aTop = 0.28, aBottom = 0.0) => {
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
    if (changed) chart.update("none");
  },
};

export default function IncomeExpenseChartWidget() {
  const token = useSelector((s: RootState) => s.auth.token);

  const [granularity, setGranularity] = React.useState<Granularity>("month");
  const [preset, setPreset] = React.useState<Preset>("90d");
  const [showIncome, setShowIncome] = React.useState(true);
  const [showExpense, setShowExpense] = React.useState(true);

  const range = React.useMemo(() => presetToRange(preset), [preset]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["summary", granularity, preset, range.startDate ?? null, range.endDate ?? null],
    queryFn: ({ signal }) =>
      fetchSummary(
        token!,
        {
          granularity,
          ...(range.startDate ? { startDate: range.startDate } : {}),
          ...(range.endDate ? { endDate: range.endDate } : {}),
        },
        signal
      ),
    enabled: !!token,
  });

  const labels = data?.data.map((d) => d.period) ?? [];
  const incomeValues = data?.data.map((d) => d.income) ?? [];
  const expenseValues = data?.data.map((d) => d.expense) ?? [];

  const datasets: ChartData<"line">["datasets"] = [
    showIncome && {
      label: "Income",
      data: incomeValues,
      borderColor: incomeColor,
      backgroundColor: "rgba(34,197,94,0.25)", // temp until plugin swaps to gradient
      _baseColor: incomeColor, // <-- used by plugin
      fill: true,
      tension: 0.35,
      pointRadius: 2,
      pointHoverRadius: 4,
      borderWidth: 2,
    },
    showExpense && {
      label: "Expense",
      data: expenseValues,
      borderColor: expenseColor,
      backgroundColor: "rgba(239,68,68,0.25)", // temp until plugin swaps to gradient
      _baseColor: expenseColor, // <-- used by plugin
      fill: true,
      tension: 0.35,
      pointRadius: 2,
      pointHoverRadius: 4,
      borderWidth: 2,
    },
  ].filter(Boolean) as any;

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }, // no default filters
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
        ticks: {
          color: "rgba(255,255,255,0.75)",
          callback: (v) => currency.format(Number(v)),
        },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
    },
  };

  const pill =
    "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors";
  const pillActive = "bg-white/15 border-white/20 text-white";
  const pillInactive = "bg-white/5 border-white/10 text-white/70 hover:bg-white/10";

  return (
    <div className={glass}>
      {/* Header + modern controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Income vs Expense</h3>

        <div className="flex flex-wrap items-center gap-2">
          {/* Granularity pills */}
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-full p-1">
            {(["day", "month", "year"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`${pill} ${granularity === g ? pillActive : pillInactive}`}
              >
                {g === "day" ? "Daily" : g === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>

          {/* Presets */}
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-full p-1">
            {(["30d", "90d", "ytd", "1y", "all"] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`${pill} ${preset === p ? pillActive : pillInactive}`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Series toggles */}
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-full p-1">
            <button
              onClick={() => setShowIncome((s) => !s)}
              className={`${pill} ${showIncome ? pillActive : pillInactive}`}
              title="Toggle Income"
            >
              Income
            </button>
            <button
              onClick={() => setShowExpense((s) => !s)}
              className={`${pill} ${showExpense ? pillActive : pillInactive}`}
              title="Toggle Expense"
            >
              Expense
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[260px]">
        {isLoading && <p className="text-white/70">Loading…</p>}
        {isError && <p className="text-rose-300">Failed to load chart.</p>}
        {!isLoading && !isError && (datasets.length === 0 ? (
          <p className="text-white/70">Select at least one series.</p>
        ) : (
          <Line
            data={{ labels, datasets }}
            options={options}
            plugins={[gradientPlugin]}
          />
        ))}
      </div>
    </div>
  );
}
