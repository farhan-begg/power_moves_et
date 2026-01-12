// src/components/widgets/AdviceWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { listPositions } from "../../api/stocks";
import { fetchSummary } from "../../api/transaction";
import { GlassCard } from "../common";

type Risk = "conservative" | "balanced" | "growth" | "aggressive";

const glass = "rounded-2xl p-5 backdrop-blur-md bg-[var(--widget-bg)] border border-[var(--widget-border)] shadow-xl ring-1 ring-[var(--widget-ring)]";

export default function AdviceWidget() {
  const token = useSelector((s: RootState) => s.auth.token)!;

  // Pull the basics (replace with your existing hooks if available)
  const { data: positions } = useQuery({
    queryKey: ["positions"],
    queryFn: () => listPositions(token),
    enabled: !!token,
  });

  const { data: cashflow } = useQuery({
    queryKey: ["summary", "month", "ytd"], // example; use your own
    queryFn: () => fetchSummary(token, { granularity: "month" }),
    enabled: !!token,
  });

  // If you have a net worth endpoint, use that; else derive a rough figure:
  const totals = positions?.totals;
  const holdingsValue = totals?.current ?? 0;

  // Example: average income/expense over last N periods
  const incomeMonthlyAvg = React.useMemo(() => {
    const rows = cashflow?.data ?? [];
    if (!rows.length) return 0;
    const last = rows.slice(-6); // last 6 months
    const sum = last.reduce((s: number, r: any) => s + (r.income || 0), 0);
    return sum / Math.max(1, last.length);
  }, [cashflow]);

  const expenseMonthlyAvg = React.useMemo(() => {
    const rows = cashflow?.data ?? [];
    if (!rows.length) return 0;
    const last = rows.slice(-6);
    const sum = last.reduce((s: number, r: any) => s + (r.expense || 0), 0);
    return sum / Math.max(1, last.length);
  }, [cashflow]);

  const savingsRatePct = React.useMemo(() => {
    if (!incomeMonthlyAvg) return 0;
    const savings = incomeMonthlyAvg - expenseMonthlyAvg;
    return (savings / incomeMonthlyAvg) * 100;
  }, [incomeMonthlyAvg, expenseMonthlyAvg]);

  // Form controls
  const [risk, setRisk] = React.useState<Risk>("balanced");
  const [goals, setGoals] = React.useState<Array<{ label: string; horizon: "short" | "medium" | "long"; target?: number }>>([
    { label: "Emergency fund", horizon: "short", target: Math.max(3, Math.round((expenseMonthlyAvg || 2500) * 3)) },
  ]);
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [advice, setAdvice] = React.useState<string>("");

  async function getAdvice() {
    setLoading(true);
    setAdvice("");
    try {
      // Build concise metrics payload
      const holdings = (positions?.positions ?? []).map((p) => ({
        symbol: p.symbol,
        name: p.name,
        value: p.currentValue ?? (p.shares * (p.currentPrice ?? p.purchasePrice)),
      }));
      const holdingsTotal = holdings.reduce((s, h) => s + h.value, 0);
      const holdingsWithPct = holdings.map(h => ({ ...h, pct: holdingsTotal > 0 ? (h.value / holdingsTotal) * 100 : 0 }));

      const metrics = {
        currency: "USD",
        netWorth: undefined,             // If you track total net worth elsewhere, plug it in here
        assets: holdingsTotal,           // minimum viable "assets"
        debts: 0,                        // plug in your debts total if you have it
        investable: holdingsTotal,       // rough proxy
        emergencyFundMonths: Math.max(0, Math.round((holdingsTotal / Math.max(1, expenseMonthlyAvg)) * 10) / 10),
        incomeMonthlyAvg,
        expenseMonthlyAvg,
        savingsRatePct,
        debtBreakdown: [],               // fill from your debts endpoint if available
        holdings: holdingsWithPct,
        goals,
        riskTolerance: risk,
        notes: notes || undefined,
      };

      const resp = await fetch("/api/advice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(metrics),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to get advice");
      setAdvice(data.advice || "");
    } catch (e: any) {
      setAdvice(`Failed to generate advice: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">AI Money Coach</h3>
        <div className="text-xs text-[var(--text-muted)]">
          Uses your portfolio + cashflow to suggest next steps.
        </div>
      </div>

      {/* Controls */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] text-[var(--text-muted)]">Risk tolerance</label>
          <select
            className="w-full rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] focus:outline-none focus:ring-[var(--widget-ring)]"
            value={risk}
            onChange={(e) => setRisk(e.target.value as Risk)}
          >
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="growth">Growth</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] text-[var(--text-muted)]">Notes (optional)</label>
          <input
            className="w-full rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-[var(--widget-ring)]"
            placeholder="E.g., saving for a house in 3 years"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Goals editor (simple) */}
      <div className="mt-3">
        <label className="text-[11px] text-[var(--text-muted)]">Goals</label>
        <div className="space-y-2 mt-1">
          {goals.map((g, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3">
              <input
                className="rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] focus:outline-none focus:ring-[var(--widget-ring)]"
                placeholder="Goal (e.g., Down payment)"
                value={g.label}
                onChange={(e) => {
                  const copy = [...goals]; copy[i] = { ...copy[i], label: e.target.value }; setGoals(copy);
                }}
              />
              <select
                className="rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] focus:outline-none focus:ring-[var(--widget-ring)]"
                value={g.horizon}
                onChange={(e) => {
                  const copy = [...goals]; copy[i] = { ...copy[i], horizon: e.target.value as any }; setGoals(copy);
                }}
              >
                <option value="short">Short (&lt;2y)</option>
                <option value="medium">Medium (2–5y)</option>
                <option value="long">Long (5y+)</option>
              </select>
              <input
                className="rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] focus:outline-none focus:ring-[var(--widget-ring)]"
                placeholder="Target amount (optional)"
                inputMode="decimal"
                value={g.target ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const copy = [...goals];
                  copy[i] = { ...copy[i], target: v ? Number(v) : undefined };
                  setGoals(copy);
                }}
              />
            </div>
          ))}
          <button
            onClick={() => setGoals(g => [...g, { label: "", horizon: "medium" } as any])}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
          >
            + Add goal
          </button>
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={getAdvice}
          disabled={loading}
          className="rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--positive)" }}
        >
          {loading ? "Analyzing…" : "Get Advice"}
        </button>
      </div>

      {/* Output */}
      <div className="mt-4 rounded-xl border border-[var(--widget-border)] bg-[var(--widget-bg)] p-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap">
        {advice || "Advice will appear here."}
      </div>

      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
        Educational only—this is not financial, investment, tax, or legal advice.
      </div>
    </GlassCard>
  );
}
