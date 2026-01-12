// frontend/src/components/widgets/NetWorthProjectionWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";
import {
  fetchNetWorthHistory,
  fetchExpenseCategories,
  type NetWorthHistoryPoint,
  type CategoryExpense,
} from "../../api/netWorthProjection";
import { toLocalYMDRange, toIsoStartEndExclusive } from "../../helpers/date";
import { selectSelectedAccountId } from "../../app/selectors";
import { ALL_ACCOUNTS_ID } from "../../features/filters/globalAccountFilterSlice";

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Preset = "30d" | "90d" | "ytd" | "1y" | "all";

function presetToRange(preset: Preset) {
  if (preset === "all") {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2); // 2 years
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  const range = toLocalYMDRange(preset);
  const iso = toIsoStartEndExclusive(range.startDate, range.endDate);
  return { startDate: iso.startISO, endDate: iso.endExclusiveISO };
}

export default function NetWorthProjectionWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  const selectedAccountId = useSelector(selectSelectedAccountId);
  const accountId =
    selectedAccountId && selectedAccountId !== ALL_ACCOUNTS_ID
      ? selectedAccountId
      : undefined;

  const [preset, setPreset] = React.useState<Preset>("1y");
  const [showProjection, setShowProjection] = React.useState(false);
  const [projectionMonths, setProjectionMonths] = React.useState(6);
  const [categoryAdjustments, setCategoryAdjustments] = React.useState<
    Record<string, number>
  >({});

  const range = presetToRange(preset);

  // Fetch historical data
  const historyQ = useQuery({
    queryKey: [
      "net-worth-history",
      preset,
      range.startDate,
      range.endDate,
      accountId,
    ],
    queryFn: () =>
      fetchNetWorthHistory(token!, {
        startDate: range.startDate,
        endDate: range.endDate,
        granularity: "month",
        accountId,
      }),
    enabled: !!token,
    staleTime: 60_000,
  });

  // Fetch expense categories
  const categoriesQ = useQuery({
    queryKey: ["expense-categories", range.startDate, range.endDate, accountId],
    queryFn: () =>
      fetchExpenseCategories(token!, {
        startDate: range.startDate,
        endDate: range.endDate,
        accountId,
      }),
    enabled: !!token,
    staleTime: 60_000,
  });

  // Calculate projected data
  const { chartData, historicalLength } = React.useMemo(() => {
    if (!historyQ.data?.data) return { chartData: [], historicalLength: 0 };

    const historical = [...historyQ.data.data];
    const projected: Array<NetWorthHistoryPoint & { projectedNetWorth?: number }> = [];

    if (showProjection && historical.length > 0) {
      const lastPoint = historical[historical.length - 1];
      const avgMonthlyIncome =
        historical.reduce((sum, p) => sum + p.income, 0) / historical.length;
      const avgMonthlyExpense =
        historical.reduce((sum, p) => sum + p.expense, 0) / historical.length;

      // Calculate total monthly savings from category adjustments
      const totalAdjustment = Object.values(categoryAdjustments).reduce(
        (sum, adj) => sum + adj,
        0
      );
      const adjustedMonthlyExpense = Math.max(
        0,
        avgMonthlyExpense - totalAdjustment
      );

      let runningNetWorth = lastPoint.netWorth;
      const lastDate = new Date(lastPoint.date + "-01");

      for (let i = 1; i <= projectionMonths; i++) {
        const date = new Date(lastDate);
        date.setMonth(date.getMonth() + i);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        const cashflow = avgMonthlyIncome - adjustedMonthlyExpense;
        runningNetWorth += cashflow;

        projected.push({
          date: dateStr,
          netWorth: lastPoint.netWorth, // Keep historical value for base area
          projectedNetWorth: runningNetWorth, // Projected value
          income: avgMonthlyIncome,
          expense: adjustedMonthlyExpense,
          cashflow,
        });
      }
    }

    // Add projectedNetWorth field to all data points (null for historical)
    const enrichedHistorical = historical.map((h, idx) => ({
      ...h,
      projectedNetWorth: idx === historical.length - 1 && showProjection ? h.netWorth : null,
    }));

    return {
      chartData: [...enrichedHistorical, ...projected],
      historicalLength: historical.length,
    };
  }, [
    historyQ.data,
    showProjection,
    projectionMonths,
    categoryAdjustments,
  ]);

  const handleCategoryAdjust = (category: string, reduction: number) => {
    setCategoryAdjustments((prev) => ({
      ...prev,
      [category]: Math.max(0, reduction),
    }));
  };

  const resetProjection = () => {
    setCategoryAdjustments({});
    setShowProjection(false);
  };

  const categories = categoriesQ.data?.categories || [];
  const hasAdjustments = Object.keys(categoryAdjustments).length > 0;
  const totalMonthlySavings = Object.values(categoryAdjustments).reduce(
    (sum, adj) => sum + adj,
    0
  );

  // Calculate insights and suggestions
  const insights = React.useMemo(() => {
    if (!historyQ.data?.data || chartData.length === 0) return [];

    const historical = historyQ.data.data;
    const avgMonthlyIncome = historical.reduce((sum, p) => sum + p.income, 0) / historical.length;
    const avgMonthlyExpense = historical.reduce((sum, p) => sum + p.expense, 0) / historical.length;
    const avgMonthlySavings = avgMonthlyIncome - avgMonthlyExpense;
    const currentNetWorth = historyQ.data.currentNetWorth || 0;

    const suggestions: Array<{
      type: "reduce" | "increase" | "stop";
      category?: string;
      amount: number;
      impact: string;
      description: string;
    }> = [];

    // Top spending categories suggestions
    const topCategories = categories.slice(0, 3);
    topCategories.forEach((cat) => {
      if (cat.monthlyAvg > 50) {
        const reduction = Math.round(cat.monthlyAvg * 0.2); // Suggest 20% reduction
        const yearlyImpact = reduction * 12;
        
        suggestions.push({
          type: "reduce",
          category: cat.category,
          amount: reduction,
          impact: `Save ${currency.format(reduction)}/mo`,
          description: `Cut ${cat.category} by ${currency.format(reduction)}/month → ${currency.format(yearlyImpact)}/year saved`,
        });
      }
    });

    // Income increase suggestion
    if (avgMonthlyIncome > 0) {
      const increase = Math.round(avgMonthlyIncome * 0.1); // Suggest 10% increase
      const yearlyImpact = increase * 12;
      
      suggestions.push({
        type: "increase",
        amount: increase,
        impact: `+${currency.format(increase)}/mo`,
        description: `Increase income by ${currency.format(increase)}/month → ${currency.format(yearlyImpact)}/year more`,
      });
    }

    // Stop subscription suggestion (if there's a recurring expense)
    const subscriptionCategories = categories.filter(cat => 
      cat.category.toLowerCase().includes("subscription") || 
      cat.category.toLowerCase().includes("streaming") ||
      cat.category.toLowerCase().includes("software")
    );
    
    if (subscriptionCategories.length > 0) {
      const topSub = subscriptionCategories[0];
      const yearlyImpact = topSub.monthlyAvg * 12;
      
      suggestions.push({
        type: "stop",
        category: topSub.category,
        amount: topSub.monthlyAvg,
        impact: `Save ${currency.format(topSub.monthlyAvg)}/mo`,
        description: `Cancel ${topSub.category} → ${currency.format(yearlyImpact)}/year saved`,
      });
    }

    return suggestions.slice(0, 4); // Top 4 suggestions
  }, [historyQ.data, chartData, categories]);

  // Calculate growth metrics
  const growthMetrics = React.useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].netWorth;
    const last = chartData[chartData.length - 1].netWorth;
    const growth = last - first;
    const growthPercent = first !== 0 ? ((growth / Math.abs(first)) * 100) : 0;
    const projectedGrowth = showProjection && chartData.length > historicalLength
      ? chartData[chartData.length - 1].netWorth - chartData[historicalLength - 1]?.netWorth
      : null;
    
    return { growth, growthPercent, projectedGrowth, first, last };
  }, [chartData, showProjection, historicalLength]);

  return (
    <div className="relative overflow-hidden rounded-2xl p-5 bg-[var(--widget-bg)] border border-[var(--widget-border)] shadow-xl ring-1 ring-[var(--widget-ring)]">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              Net Worth Projection
            </h3>
            <div className="text-xs text-[var(--text-muted)]">
              Track net worth over time with expense reduction predictions
            </div>
          </div>
        </div>

        {/* Preset buttons - ✅ Desktop: Smaller, Mobile: Touch-friendly */}
        <div className="flex flex-wrap gap-2">
          {(["30d", "90d", "ytd", "1y", "all"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`text-xs rounded-lg px-3 py-1.5 md:px-2 md:py-1 ring-1 transition-colors min-h-[36px] md:min-h-0 ${
                preset === p
                  ? "bg-[var(--btn-hover)] text-[var(--text-primary)] ring-[var(--widget-ring)]"
                  : "bg-[var(--btn-bg)] text-[var(--text-secondary)] ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)]"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Error / Loading */}
      {historyQ.isError && (
        <div className="mb-4 rounded-lg border border-[var(--negative)]/30 bg-[var(--negative-bg-soft)] p-3 text-[var(--negative)] text-sm">
          <div className="font-medium">Failed to load net worth history</div>
          {historyQ.error && (
            <div className="mt-1 text-xs opacity-80">
              {(historyQ.error as any)?.message || String(historyQ.error)}
            </div>
          )}
        </div>
      )}

      {historyQ.isLoading && (
        <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
          Loading...
        </div>
      )}

      {/* Growth Metrics */}
      {!historyQ.isLoading && !historyQ.isError && chartData.length > 0 && growthMetrics && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3"
        >
          <div className="rounded-xl bg-gradient-to-br from-[var(--positive-bg-soft)] to-[var(--positive-bg-soft)]/50 p-3 border border-[var(--widget-border)]">
            <div className="text-xs text-[var(--text-muted)] mb-1">Current Net Worth</div>
            <div className="text-lg font-bold text-[var(--positive)]">
              {currency.format(growthMetrics.last)}
            </div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-[var(--positive-bg-soft)] to-[var(--positive-bg-soft)]/50 p-3 border border-[var(--widget-border)]">
            <div className="text-xs text-[var(--text-muted)] mb-1">Total Growth</div>
            <div className={`text-lg font-bold ${growthMetrics.growth >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>
              {growthMetrics.growth >= 0 ? "+" : ""}{currency.format(growthMetrics.growth)}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {growthMetrics.growthPercent >= 0 ? "+" : ""}{growthMetrics.growthPercent.toFixed(1)}%
            </div>
          </div>
          {showProjection && growthMetrics.projectedGrowth !== null && (
            <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-3 border border-blue-500/20">
              <div className="text-xs text-[var(--text-muted)] mb-1">Projected Growth</div>
              <div className={`text-lg font-bold ${growthMetrics.projectedGrowth >= 0 ? "text-blue-400" : "text-[var(--negative)]"}`}>
                {growthMetrics.projectedGrowth >= 0 ? "+" : ""}{currency.format(growthMetrics.projectedGrowth)}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Chart */}
      {!historyQ.isLoading && !historyQ.isError && chartData.length > 0 && (
        <>
          <div className="h-96 mb-4 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  {/* Historical net worth gradient */}
                  <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  {/* Projected net worth gradient */}
                  <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                  {/* Income gradient */}
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  {/* Expense gradient */}
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--chart-grid)"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="date"
                  stroke="var(--chart-tick)"
                  tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                  tickLine={{ stroke: "var(--chart-grid)" }}
                />
                <YAxis
                  stroke="var(--chart-tick)"
                  tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                  tickFormatter={(value) => currency.format(value)}
                  tickLine={{ stroke: "var(--chart-grid)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--widget-bg)",
                    backdropFilter: "var(--widget-blur)",
                    WebkitBackdropFilter: "var(--widget-blur)",
                    border: "1px solid var(--widget-border)",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    color: "var(--text-primary)",
                  }}
                  formatter={(value: number, name: string) => [
                    currency.format(value),
                    name === "netWorth"
                      ? "Net Worth"
                      : name === "income"
                      ? "Income"
                      : name === "expense"
                      ? "Expense"
                      : name,
                  ]}
                  labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                  cursor={{ stroke: "var(--widget-border)", strokeWidth: 1 }}
                />
                <Legend
                  wrapperStyle={{ color: "var(--text-primary)", paddingTop: "10px" }}
                  iconType="circle"
                />
                {showProjection && historicalLength > 0 && (
                  <ReferenceLine
                    x={chartData[historicalLength - 1]?.date}
                    stroke="var(--text-muted)"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{ value: "Today", position: "insideTopRight", fill: "var(--text-muted)", fontSize: 11 }}
                  />
                )}
                {/* Historical Net Worth Area */}
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="var(--positive)"
                  strokeWidth={3}
                  fill="url(#netWorthGradient)"
                  name="Net Worth"
                  isAnimationActive={true}
                  animationDuration={1500}
                  animationEasing="ease-out"
                  dot={false}
                  activeDot={{ r: 6, fill: "var(--positive)", strokeWidth: 2, stroke: "var(--widget-bg)" }}
                />
                {/* Projected Net Worth Area (overlay for projected portion) */}
                {showProjection && chartData.length > historicalLength && (
                  <Area
                    type="monotone"
                    dataKey="projectedNetWorth"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    strokeDasharray="8 4"
                    fill="url(#projectedGradient)"
                    name="Projected Net Worth"
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    animationBegin={300}
                    dot={false}
                    activeDot={{ r: 6, fill: "#3b82f6", strokeWidth: 2, stroke: "var(--widget-bg)" }}
                    connectNulls={true}
                  />
                )}
                {/* Income Line */}
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#incomeGradient)"
                  name="Income"
                  isAnimationActive={true}
                  animationDuration={1500}
                  animationEasing="ease-out"
                  dot={false}
                  strokeDasharray="4 4"
                />
                {/* Expense Line */}
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="url(#expenseGradient)"
                  name="Expense"
                  isAnimationActive={true}
                  animationDuration={1500}
                  animationEasing="ease-out"
                  dot={false}
                  strokeDasharray="4 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Projection Controls */}
          <div className="border-t border-[var(--widget-border)] pt-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-medium text-[var(--text-primary)]">
                  Expense Reduction Projection
                </h4>
                <div className="text-xs text-[var(--text-muted)]">
                  Adjust expenses by category to see projected net worth
                </div>
              </div>
              {/* ✅ Desktop: Show projection controls always, Mobile: Hide when not active */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showProjection}
                    onChange={(e) => setShowProjection(e.target.checked)}
                    className="rounded border-[var(--widget-border)]"
                  />
                  <span className="hidden sm:inline">Show Projection</span>
                  <span className="sm:hidden">Projection</span>
                </label>
                {/* ✅ Desktop: Always show controls, Mobile: Only when projection is active */}
                <div className={`flex items-center gap-2 ${showProjection ? 'flex' : 'hidden md:flex'}`}>
                  <select
                    value={projectionMonths}
                    onChange={(e) =>
                      setProjectionMonths(Number(e.target.value))
                    }
                    className="text-xs rounded-lg bg-[var(--btn-bg)] border border-[var(--widget-border)] px-2 py-1 md:py-0.5 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] min-h-[36px] md:min-h-0"
                  >
                    <option value={3}>3 months</option>
                    <option value={6}>6 months</option>
                    <option value={12}>12 months</option>
                    <option value={24}>24 months</option>
                  </select>
                  {hasAdjustments && (
                    <button
                      onClick={resetProjection}
                      className="text-xs rounded-lg bg-[var(--btn-bg)] px-2 py-1 md:py-0.5 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)] min-h-[36px] md:min-h-0 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ✅ Desktop: Show projection checklist always when enabled, Mobile: Only when active */}
            <div className={`${showProjection ? 'block' : 'hidden md:block'}`}>
              {totalMonthlySavings > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mb-3 rounded-lg bg-gradient-to-r from-[var(--positive-bg-soft)] to-[var(--positive-bg-soft)]/50 p-2 md:p-3 border border-[var(--positive-ring)]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-[var(--text-muted)] mb-0.5">Your Monthly Savings</div>
                        <div className="text-base md:text-lg font-bold text-[var(--positive)]">
                          {currency.format(totalMonthlySavings)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-[var(--text-muted)] mb-0.5">Yearly Impact</div>
                        <div className="text-base md:text-lg font-bold text-[var(--positive)]">
                          {currency.format(totalMonthlySavings * 12)}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {categories.length > 0 && (
                  <div className="space-y-2 max-h-48 md:max-h-64 overflow-y-auto">
                    {categories.slice(0, 10).map((cat) => {
                      const adjustment = categoryAdjustments[cat.category] || 0;
                      return (
                        <div
                          key={cat.category}
                          className="flex items-center justify-between gap-2 text-sm p-1 md:p-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[var(--text-primary)] truncate text-xs md:text-sm">
                              {cat.category || "Uncategorized"}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              Avg: {currency.format(cat.monthlyAvg)}/mo
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max={cat.monthlyAvg}
                              step="10"
                              value={adjustment}
                              onChange={(e) =>
                                handleCategoryAdjust(
                                  cat.category,
                                  Number(e.target.value)
                                )
                              }
                              placeholder="0"
                              className="w-16 md:w-20 text-xs rounded-lg bg-[var(--btn-bg)] border border-[var(--widget-border)] px-2 py-1 md:py-0.5 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] min-h-[36px] md:min-h-0"
                            />
                            <span className="text-xs text-[var(--text-muted)] w-10 md:w-12 text-right">
                              {currency.format(adjustment)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        </>
      )}

      {/* Smart Suggestions - Always visible when data is available */}
      {!historyQ.isLoading && !historyQ.isError && insights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="border-t border-[var(--widget-border)] pt-4 mt-4"
        >
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            💡 Quick Wins to Grow Your Net Worth
          </h4>
          <div className="space-y-2">
            {insights.map((insight, idx) => {
              const yearlyImpact = insight.amount * 12;
              
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  className="rounded-lg bg-[var(--btn-bg)] border border-[var(--widget-border)] p-2 md:p-3 hover:bg-[var(--btn-hover)] transition-colors cursor-pointer"
                  onClick={() => {
                    if (insight.type === "reduce" && insight.category) {
                      const cat = categories.find(c => c.category === insight.category);
                      if (cat) {
                        handleCategoryAdjust(insight.category, insight.amount);
                        if (!showProjection) setShowProjection(true);
                      }
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {insight.type === "reduce" && (
                          <span className="text-xs font-semibold text-[var(--positive)] bg-[var(--positive-bg-soft)] px-2 py-0.5 rounded-full">
                            Reduce Spending
                          </span>
                        )}
                        {insight.type === "increase" && (
                          <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                            Increase Income
                          </span>
                        )}
                        {insight.type === "stop" && (
                          <span className="text-xs font-semibold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                            Cancel Subscription
                          </span>
                        )}
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {insight.impact}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--text-secondary)]">
                        {insight.description}
                      </div>
                      {insight.type === "reduce" && (
                        <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                          💰 Click to apply this change and see your projected net worth
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--text-muted)] mb-0.5">In 1 year</div>
                      <div className="text-sm font-bold text-[var(--positive)]">
                        +{currency.format(yearlyImpact)}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {!historyQ.isLoading &&
        !historyQ.isError &&
        chartData.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)]">
            No net worth data available for this period
          </div>
        )}
    </div>
  );
}
