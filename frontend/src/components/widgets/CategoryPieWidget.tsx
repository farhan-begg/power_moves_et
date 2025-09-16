// src/components/widgets/CategoryPieWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";
import { fetchCategoryStats, type CategoryStatRow } from "../../api/transaction";
import { toIsoStartEndExclusive, toLocalYMDRange } from "../../helpers/date";
import { CategoryIcon } from "../icons/CategoryIcons";
import { motion, LayoutGroup } from "framer-motion";

type Preset = "30d" | "90d" | "ytd" | "1y";

const glass =
  "relative rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

const isRealAccountId = (v?: string | null) =>
  !!v && !["__all__", "all", "undefined", "null", ""].includes(String(v));

const norm = (s?: string) => (s || "").trim().toLowerCase();

/** GENERAL_SERVICES_ACCOUNTING → General Services · Accounting */
function prettyLabel(s?: string) {
  const t = (s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const words = t.split(" ").filter(Boolean).map((w) => w[0]?.toUpperCase() + w.slice(1));
  if (words.length > 2) return `${words.slice(0, -1).join(" ")} · ${words.at(-1)}`;
  return words.join(" ");
}

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

/* ---------- value coercion ---------- */
function getExpenseValue(row: any): number {
  const tryPos = [row.spend, row.expense, row.expenses, row.outflow, row.spending, row.totalExpense];
  for (const v of tryPos) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const tryNeg = [row.net, row.total, row.amount, row.value, row.sum];
  for (const v of tryNeg) {
    const n = Number(v);
    if (Number.isFinite(n) && n < 0) return Math.abs(n);
  }
  return 0;
}

function getIncomeValue(row: any): number {
  const tryPos = [row.income, row.inflows, row.earning, row.earnings, row.totalIncome];
  for (const v of tryPos) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const maybe = [row.net, row.total, row.amount, row.value, row.sum];
  for (const v of maybe) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Premium neon palette */
const PALETTE = [
  "#7DD3FC", "#34D399", "#A78BFA", "#F472B6", "#F59E0B",
  "#60A5FA", "#FB7185", "#4ADE80", "#F87171", "#FBBF24",
] as const;

function colorForLabel(label: string) {
  const s = norm(label);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/* ---------- active slice with glow ---------- */
function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  const idBase = String(fill || "#ffffff").replace("#", "");
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 4}
        outerRadius={outerRadius + 12}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.18}
        filter={`url(#glow-strong-${idBase})`}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke={fill}
        strokeWidth={2}
        filter={`url(#glow-strong-${idBase})`}
      />
    </g>
  );
}

/* ---------- Segmented controls (animated) ---------- */
type SegmentedOption = { label: string; value: string };
function Segmented({
  id,
  options,
  value,
  onChange,
  size = "sm",
}: {
  id: string;
  options: SegmentedOption[];
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2.5 py-1" : "px-3.5 py-1.5";
  const text = size === "sm" ? "text-xs" : "text-sm";

  return (
    <LayoutGroup id={id}>
      <div className="inline-flex items-center gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10 shadow-inner">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`relative ${pad} ${text} rounded-full text-white/80 transition`}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* thumb */}
              {active && (
                <motion.span
                  layoutId={`seg-thumb-${id}`}
                  className="absolute inset-0 rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.28 }}
                  style={{
                    background:
                      "radial-gradient(120% 120% at 50% 50%, rgba(255,255,255,0.22), rgba(255,255,255,0.10))",
                    boxShadow:
                      "0 0 16px rgba(255,255,255,0.18) inset, 0 2px 10px rgba(0,0,0,0.25)",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

export default function CategoryPieWidget() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const selectedAccountIdRaw = useSelector((s: RootState) => s.accountFilter.selectedAccountId);
  const accountId = isRealAccountId(selectedAccountIdRaw) ? selectedAccountIdRaw! : undefined;

  // view mode + range
  const [mode, setMode] = React.useState<"expense" | "income">("expense");
  const [preset, setPreset] = React.useState<Preset>("90d");

  // local YMD -> ISO (exclusive end)
  const { startDate: startYMD, endDate: endYMD } = React.useMemo(() => {
    if (preset === "90d") return toLocalYMDRange("90d");
    if (preset === "30d") return toLocalYMDRange("30d");
    if (preset === "ytd") return toLocalYMDRange("ytd");
    return toLocalYMDRange("1y");
  }, [preset]);

  const { startISO, endExclusiveISO } = React.useMemo(
    () => toIsoStartEndExclusive(startYMD, endYMD),
    [startYMD, endYMD]
  );

  const statsQ = useQuery<CategoryStatRow[]>({
    queryKey: ["category-stats", startISO, endExclusiveISO, accountId ?? "ALL"],
    queryFn: () =>
      fetchCategoryStats(token, {
        startDate: startISO,
        endDate: endExclusiveISO,
        accountId,
      }),
    enabled: !!token,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  // dataset (+ "Other" roll-up)
  const { pieData, total } = React.useMemo(() => {
    const rowsRaw =
      (statsQ.data ?? [])
        .map((r) => ({
          label: r.category || "Uncategorized",
          value: mode === "expense" ? getExpenseValue(r) : getIncomeValue(r),
        }))
        .filter((r) => r.value > 0);

    rowsRaw.sort((a, b) => b.value - a.value);

    const MAX_SLICES = 8;
    if (rowsRaw.length <= MAX_SLICES) {
      return { pieData: rowsRaw, total: rowsRaw.reduce((s, r) => s + r.value, 0) };
    }
    const head = rowsRaw.slice(0, MAX_SLICES - 1);
    const tail = rowsRaw.slice(MAX_SLICES - 1);
    const otherTotal = tail.reduce((s, r) => s + r.value, 0);
    const out = [...head, { label: "Other", value: otherTotal }];
    return { pieData: out, total: out.reduce((s, r) => s + r.value, 0) };
  }, [statsQ.data, mode]);

  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const isActive = (idx: number) => activeIndex === idx;
  const toggleIndex = (idx: number) => setActiveIndex((prev) => (prev === idx ? null : idx));

  // broadcast filter to transactions
  const handleSliceClick = (label: string) => {
    window.dispatchEvent(
      new CustomEvent("ui:transactions:filter", {
        detail: {
          category: label === "Other" ? null : label,
          type: mode,
          startDate: startISO,
          endDate: endExclusiveISO,
          accountId: accountId ?? null,
        },
      })
    );
  };

  // accent color per mode
  const accent = mode === "expense" ? "#FB7185" /* rose-400 */ : "#34D399" /* emerald-400 */;

  return (
    <div className={glass}>
      {/* soft background bloom */}
      <div
        className="pointer-events-none absolute -top-14 -right-12 h-44 w-44 rounded-full blur-3xl opacity-25"
        style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(125,211,252,.45), transparent)" }}
      />

      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {mode === "expense" ? "Spending by Category" : "Income by Category"}
          </h3>
          <div className="text-xs text-white/60">
            {preset.toUpperCase()} · {accountId ? "Selected account" : "All accounts"}
          </div>
        </div>

        {/* Premium animated controls */}
        <div className="flex items-center gap-3">
          <Segmented
            id="mode"
            value={mode}
            onChange={(v) => setMode(v as "expense" | "income")}
            options={[
              { label: "Spending", value: "expense" },
              { label: "Income", value: "income" },
            ]}
            size="md"
          />
          <Segmented
            id="preset"
            value={preset}
            onChange={(v) => setPreset(v as Preset)}
            options={[
              { label: "30D", value: "30d" },
              { label: "90D", value: "90d" },
              { label: "YTD", value: "ytd" },
              { label: "1Y", value: "1y" },
            ]}
            size="sm"
          />
        </div>
      </div>

      {/* Chart + floating KPI */}
      <div className="relative">
        {/* subtle inner halo in donut center for depth */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-24 w-24 rounded-full bg-white/5 blur-[2px]" />
        </div>

        {statsQ.isError ? (
          <div className="text-rose-300 text-sm">Failed to load category stats.</div>
        ) : (pieData.length === 0) ? (
          <div className="text-white/70 text-sm">
            No {mode === "expense" ? "expense" : "income"} activity in this period.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* Glow filters */}
                <defs>
                  {pieData.map((row, idx) => {
                    const color = row.label === "Other" ? "#9CA3AF" : colorForLabel(row.label);
                    const idBase = color.replace("#", "");
                    return (
                      <React.Fragment key={`defs-${idBase}-${idx}`}>
                        <filter id={`glow-${idBase}`} x="-50%" y="-50%" width="200%" height="200%">
                          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={color} floodOpacity="0.65" />
                          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={color} floodOpacity="0.35" />
                        </filter>
                        <filter id={`glow-strong-${idBase}`} x="-60%" y="-60%" width="220%" height="220%">
                          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={color} floodOpacity="0.95" />
                          <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor={color} floodOpacity="0.55" />
                          <feDropShadow dx="0" dy="0" stdDeviation="16" floodColor={color} floodOpacity="0.35" />
                        </filter>
                      </React.Fragment>
                    );
                  })}
                </defs>

                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={64}
                  outerRadius={96}
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                  isAnimationActive
                  {...({
                    activeIndex: activeIndex ?? undefined,
                    activeShape: (p: any) => <ActiveSlice {...p} />,
                  } as any)}
                  onClick={(_: any, idx: number) => {
                    toggleIndex(idx);
                    const label = pieData[idx]?.label;
                    if (label) handleSliceClick(label);
                  }}
                >
                  {pieData.map((entry, index) => {
                    const color = entry.label === "Other" ? "#9CA3AF" : colorForLabel(entry.label);
                    const idBase = color.replace("#", "");
                    return (
                      <Cell
                        key={`slice-${entry.label}-${index}`}
                        fill={color}
                        stroke={color}
                        strokeWidth={1.2}
                        filter={`url(#${isActive(index) ? `glow-strong-${idBase}` : `glow-${idBase}`})`}
                        style={{ cursor: "pointer" }}
                      />
                    );
                  })}
                </Pie>

                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  contentStyle={{
                    background: "rgba(17,17,17,0.96)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 12,
                  }}
                  itemStyle={{ color: "#ffffff", fontSize: 12 }}
                  labelStyle={{ color: "#ffffff", fontWeight: 600, fontSize: 12 }}
                  labelFormatter={(raw: any) => prettyLabel(String(raw))}
                  formatter={(val: any, _name: any, props: any) => {
                    const slice = Number(props?.payload?.value || 0);
                    const pct = (pieData.length && slice > 0) ? (slice / (total || 1)) * 100 : 0;
                    const pctLabel = slice > 0 && pct < 0.5 ? "<0.5%" : `${pct.toFixed(1)}%`;
                    return [`${money(val)} (${pctLabel})`, prettyLabel(props?.payload?.label)];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Floating KPI chip (animated) */}
        {pieData.length > 0 && (
          <motion.div
            className="absolute right-2 top-2 sm:right-4 sm:top-3"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 26, mass: 0.28 }}
          >
            <div
              className="rounded-2xl px-3.5 py-2 shadow-xl ring-1"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                borderColor: "rgba(255,255,255,0.20)",
                boxShadow: `0 8px 24px rgba(0,0,0,0.25), 0 0 0 0.6px ${accent}40, inset 0 0 0 0.6px ${accent}60`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shadow"
                  style={{ background: accent, boxShadow: `0 0 10px ${accent}aa` }}
                />
                <div className="flex flex-col leading-none">
                  <span
                    className="uppercase tracking-wide"
                    style={{ fontSize: "clamp(10px, 1.1vw, 11px)", color: "rgba(255,255,255,0.75)" }}
                  >
                    {mode === "expense" ? "Total Spending" : "Total Income"}
                  </span>
                  <span
                    className="font-semibold text-white mt-0.5"
                    style={{ fontSize: "clamp(18px, 2.6vw, 28px)" }}
                  >
                    {money(total)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Icon-only chips (animated) */}
      {pieData.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pieData.map((row, idx) => {
            const color = row.label === "Other" ? "#9ca3af69" : colorForLabel(row.label);
            const active = isActive(idx);
            const nice = prettyLabel(row.label);
            return (
              <motion.button
                key={`chip-${row.label}-${idx}`}
                onClick={() => {
                  toggleIndex(idx);
                  handleSliceClick(row.label);
                }}
                title={`${nice} — ${money(row.value)}`}
                className={[
                  "h-9 w-9 rounded-full grid place-items-center ring-1 transition",
                  active ? "scale-105" : "",
                ].join(" ")}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  borderColor: "rgba(255,255,255,0.12)",
                  color: "white",
                }}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2, boxShadow: `0 0 18px ${color}cc, inset 0 0 10px ${color}26` }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <CategoryIcon category={row.label} className="h-4 w-4" color={color} />
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
