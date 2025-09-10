// src/components/widgets/CategoryPieWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";
import { fetchCategoryStats, type CategoryStatRow } from "../../api/transaction";
import { toIsoStartEndExclusive, localYMD } from "../../helpers/date";
import { CategoryIcon } from "../icons/CategoryIcons";

const glass =
  "relative rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

const isRealAccountId = (v?: string | null) =>
  !!v && !["__all__", "all", "undefined", "null", ""].includes(String(v));

function lastNDaysRangeYMD(days: number) {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startYMD: localYMD(start), endYMD: localYMD(end) };
}

const norm = (s?: string) => (s || "").trim().toLowerCase();

/** Make "MERCHENDICE_GROCERY_OUTLET" → "Merchendice Grocery Outlet" */
function prettyLabel(s?: string) {
  const t = (s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return t.replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Coerce any server row to a positive expense number */
function getExpenseValue(row: any): number {
  const tryPos = [row.expense, row.expenses, row.outflow, row.spending, row.totalExpense];
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

/** Neon palette */
const PALETTE = [
  "#22D3EE", "#34D399", "#A78BFA", "#F472B6", "#F59E0B",
  "#60A5FA", "#FB7185", "#4ADE80", "#F87171", "#FBBF24",
] as const;

function colorForLabel(label: string) {
  const s = norm(label);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 4}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.18}
        filter={`url(#glow-strong-${fill.replace("#", "")})`}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke={fill}
        strokeWidth={2}
        filter={`url(#glow-strong-${fill.replace("#", "")})`}
      />
    </g>
  );
}

export default function CategoryPieWidget() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const selectedAccountIdRaw = useSelector((s: RootState) => s.accountFilter.selectedAccountId);
  const accountId = isRealAccountId(selectedAccountIdRaw) ? selectedAccountIdRaw! : undefined;

  const { startYMD, endYMD } = React.useMemo(() => lastNDaysRangeYMD(90), []);
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

  const pieData = React.useMemo(() => {
    const rows = (statsQ.data ?? [])
      .map((r) => ({
        label: r.category || "Uncategorized",
        value: Number(getExpenseValue(r) || 0),
      }))
      .filter((r) => r.value > 0);
    rows.sort((a, b) => b.value - a.value);
    return rows;
  }, [statsQ.data]);

  const total = React.useMemo(() => pieData.reduce((sum, r) => sum + r.value, 0), [pieData]);

  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const isActive = (idx: number) => activeIndex === idx;
  const toggleIndex = (idx: number) => setActiveIndex((prev) => (prev === idx ? null : idx));

  return (
    <div className={glass}>
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-25"
        style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(56,189,248,.45), transparent)" }}
      />

      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Spending by Category</h3>
          <div className="text-xs text-white/60">
            Last 90 days · {accountId ? "Selected account" : "All accounts"}
          </div>
        </div>
        {statsQ.isFetching && (
          <div className="text-[11px] px-2 py-1 rounded-full bg-white/5 ring-1 ring-white/10 text-white/60">
            Updating…
          </div>
        )}
      </div>

      {statsQ.isError ? (
        <div className="text-rose-300 text-sm">Failed to load category stats.</div>
      ) : pieData.length === 0 ? (
        <div className="text-white/70 text-sm">No expense activity in this period.</div>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {pieData.map((row, idx) => {
                    const color = colorForLabel(row.label);
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
                  onClick={(_: any, idx: number) => toggleIndex(idx)}
                >
                  {pieData.map((entry, index) => {
                    const color = colorForLabel(entry.label);
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
                  itemStyle={{
                    color: "#ffffff",          // force bright rows
                    fontSize: 12,
                  }}
                  labelStyle={{
                    color: "#ffffff",          // force bright header
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                  labelFormatter={(raw: any) => prettyLabel(String(raw))}
                  formatter={(val: any, _name: any, props: any) => {
                    const slice = Number(props?.payload?.value || 0);
                    const pct = total > 0 ? (slice / total) * 100 : 0;
                    const pctLabel = slice > 0 && pct < 0.5 ? "<0.5%" : `${pct.toFixed(1)}%`;
                    const money = (n: number) =>
                      Number(n || 0).toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 2,
                      });
                    // return [valueString, nameString]
                    return [`${money(val)} (${pctLabel})`, prettyLabel(props?.payload?.label)];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {pieData.map((row, idx) => {
              const color = colorForLabel(row.label);
              const pct = total > 0 ? (row.value / total) * 100 : 0;
              const pctLabel = row.value > 0 && pct < 0.5 ? "<0.5%" : `${pct.toFixed(1)}%`;
              const active = isActive(idx);
              const nice = prettyLabel(row.label);
              return (
                <button
                  key={`chip-${row.label}-${idx}`}
                  onClick={() => toggleIndex(idx)}
                  title={`${nice} — ${pctLabel}`}
                  className={[
                    "group inline-flex items-center rounded-full px-3 py-1.5 text-sm ring-1 transition",
                    active ? "scale-[1.02]" : "",
                  ].join(" ")}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "white",
                    boxShadow: active
                      ? `0 0 18px ${color}cc, inset 0 0 10px ${color}26`
                      : `0 0 12px ${color}80`,
                  }}
                >
                  <CategoryIcon category={row.label} className="h-4 w-4 mr-1.5" color={color} />
                  <span className="text-[11px]" style={{ color }}>
                    {pctLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
