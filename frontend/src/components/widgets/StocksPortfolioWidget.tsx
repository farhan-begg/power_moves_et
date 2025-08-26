import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  searchSymbols,
  createPosition,
  listPositions,
  deletePosition,
  liveQuotes,
  fetchHistory, // ⬅️ add this helper in src/api/stocks.ts
} from "../../api/stocks";
import { ArrowPathIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import {
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

/* ==================== Styles ==================== */
const glass =
  "rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

/* ==================== Types ==================== */
type SeriesPoint = { t: number; price: number };
type SeriesMap = Map<string, SeriesPoint[]>;
type QuoteTick = { symbol: string; price: number; t: string };

type RangeKey = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";
type IntervalKey = "daily" | "monthly" | "yearly";

const PIE_COLORS = [
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#4ade80",
  "#22d3ee",
];

/* ==================== Helpers ==================== */

// live tiny in-session series (sparklines & 1D big chart)
function useLiveSeries(
  symbols: string[],
  seedPrices: Map<string, number>,
  quotes?: QuoteTick[]
) {
  const ref = React.useRef<SeriesMap>(new Map());
  const CAP = 600;

  // seed initial point so charts don't start flat
  React.useEffect(() => {
    const now = Date.now() - 1000;
    symbols.forEach((s) => {
      const arr = ref.current.get(s) ?? [];
      if (arr.length === 0 && seedPrices.has(s)) {
        arr.push({ t: now, price: seedPrices.get(s)! });
        ref.current.set(s, arr);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join("|")]);

  // push live ticks
  React.useEffect(() => {
    if (!quotes?.length) return;
    const now = Date.now();
    quotes.forEach((q) => {
      if (!symbols.includes(q.symbol)) return;
      const arr = ref.current.get(q.symbol) ?? [];
      const last = arr[arr.length - 1];
      if (!last || last.t < now || last.price !== q.price) {
        arr.push({ t: now, price: q.price });
      }
      if (arr.length > CAP) arr.shift();
      ref.current.set(q.symbol, arr);
    });
  }, [quotes, symbols.join("|")]);

  return ref.current;
}

// subtle flash on price change
function PriceCell({ price }: { price: number }) {
  const prev = React.useRef<number | null>(null);
  const [blink, setBlink] = React.useState<"up" | "down" | null>(null);

  React.useEffect(() => {
    if (prev.current !== null && prev.current !== price) {
      setBlink(price > prev.current ? "up" : "down");
      const id = setTimeout(() => setBlink(null), 350);
      return () => clearTimeout(id);
    }
    prev.current = price;
  }, [price]);

  React.useEffect(() => {
    prev.current = price;
  }, [price]);

  const cls =
    blink === "up" ? "bg-emerald-500/20" : blink === "down" ? "bg-rose-500/20" : "";

  return <span className={`rounded px-1.5 py-0.5 transition-colors ${cls}`}>${price.toFixed(2)}</span>;
}

// aggregate multiple lots per symbol -> shares, invested, avgCost
function aggregateLots(rows: any[]) {
  const by = new Map<
    string,
    { symbol: string; name?: string; shares: number; invested: number; avgCost: number; currency?: string }
  >();

  for (const r of rows) {
    const curr =
      by.get(r.symbol) ||
      { symbol: r.symbol, name: r.name, shares: 0, invested: 0, avgCost: 0, currency: r.currency };
    curr.shares += r.shares;
    curr.invested += r.amountInvested;
    by.set(r.symbol, curr);
  }

  // avoid TS2802 by using forEach (no for..of over Map)
  by.forEach((v) => {
    v.avgCost = v.shares > 0 ? v.invested / v.shares : 0;
  });

  return by;
}

function sliceByRange<T extends { t: number }>(data: T[], ms: number): T[] {
  if (!data.length) return data;
  const cutoff = Date.now() - ms;
  const sliced = data.filter((d) => d.t >= cutoff);
  return sliced.length >= 2 ? sliced : data.slice(-2);
}

function humanTime(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function startDateForRange(range: RangeKey): Date {
  const now = new Date();
  const d = new Date(now);
  switch (range) {
    case "1D":
      d.setDate(d.getDate() - 1);
      return d;
    case "1W":
      d.setDate(d.getDate() - 7);
      return d;
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "6M":
      d.setMonth(d.getMonth() - 6);
      return d;
    case "YTD":
      return new Date(now.getFullYear(), 0, 1);
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case "5Y":
      d.setFullYear(d.getFullYear() - 5);
      return d;
    case "ALL":
      return new Date(2000, 0, 1);
  }
}

function toISO(y: number, m: number, d: number) {
  return new Date(y, m, d).toISOString().slice(0, 10);
}

function groupMonthly(rows: { t: string; close: number }[]) {
  // pick last close of each month
  const byKey = new Map<string, { t: string; close: number }>();
  rows.forEach((r) => {
    const dt = new Date(r.t);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    // overwrite so the last (latest in month) wins
    byKey.set(key, { t: toISO(dt.getFullYear(), dt.getMonth() + 1, 0), close: r.close });
  });
  return Array.from(byKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, v]) => v);
}

function groupYearly(rows: { t: string; close: number }[]) {
  const byKey = new Map<number, { t: string; close: number }>();
  rows.forEach((r) => {
    const dt = new Date(r.t);
    const y = dt.getFullYear();
    byKey.set(y, { t: toISO(y, 11, 31), close: r.close }); // last close of year
  });
  return Array.from(byKey.entries())
    .sort(([a], [b]) => a - b)
    .map(([_, v]) => v);
}

/* ==================== Component ==================== */
export default function StocksPortfolioWidget() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const qc = useQueryClient();

  // UI state
  const [query, setQuery] = React.useState("");
  const [sel, setSel] = React.useState<{ symbol: string; name?: string } | null>(null);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [open, setOpen] = React.useState(false);

  const [chartType, setChartType] = React.useState<"line" | "pie">("line");
  const [view, setView] = React.useState<"overall" | "symbol">("overall");
  const [selectedSymbol, setSelectedSymbol] = React.useState<string | null>(null);

  // NEW: longer-range & aggregation
  const [range, setRange] = React.useState<RangeKey>("1M");
  const [interval, setInterval] = React.useState<IntervalKey>("daily");

  const symbol = React.useMemo(() => (sel?.symbol ?? query).trim().toUpperCase(), [sel, query]);
  const amountNum = Number(amount);
  const canSave = !!symbol && isFinite(amountNum) && amountNum > 0;


  
  // queries
  const { data: picks } = useQuery({
    queryKey: ["stockSearch", query],
    queryFn: () => (query ? searchSymbols(token, query) : Promise.resolve([])),
    enabled: !!token && query.length >= 1,
    staleTime: 60_000,
  });

  const { data: portfolio, isFetching } = useQuery({
    queryKey: ["positions"],
    queryFn: () => listPositions(token),
    enabled: !!token,
  });

  // mutations
  const addMut = useMutation({
    mutationFn: () =>
      createPosition(token, {
        symbol,
        amountInvested: amountNum,
        purchaseDate: date,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      setSel(null);
      setQuery("");
      setAmount("");
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deletePosition(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["positions"] }),
  });

  const rows = portfolio?.positions ?? [];
  const symbols = React.useMemo(() => Array.from(new Set(rows.map((r) => r.symbol))), [rows]);

  // aggregate lots per symbol
  const agg = React.useMemo(() => aggregateLots(rows), [rows]);

  // seed prices for first chart point
  const seedPrices = React.useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.symbol, r.currentPrice ?? r.purchasePrice));
    return m;
  }, [rows]);

  // live quotes every 5s (pause when tab hidden)
  const { data: live } = useQuery({
    queryKey: ["liveQuotes"],
    queryFn: () => liveQuotes(token),
    enabled: !!token && symbols.length > 0,
    refetchInterval: () => (document.visibilityState === "visible" ? 5000 : false),
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // build in-session live series
  const series = useLiveSeries(symbols, seedPrices, live?.quotes);

  // latest price by symbol (live -> fallback seed)
  const lastPriceBySymbol = React.useMemo(() => {
    const map = new Map<string, number>();
    symbols.forEach((s) => map.set(s, seedPrices.get(s) ?? 0));
    live?.quotes.forEach((q) => map.set(q.symbol, q.price));
    return map;
  }, [live?.quotes, symbols, seedPrices]);

  // live totals (used in header/summary)
  const liveTotals = React.useMemo(() => {
    const invested = rows.reduce((s, r) => s + r.amountInvested, 0);
    let current = 0;
    agg.forEach((a, sym) => {
      const p = lastPriceBySymbol.get(sym) ?? a.avgCost;
      current += p * a.shares;
    });
    const gain = Number((current - invested).toFixed(2));
    const gainPct = invested > 0 ? Number(((gain / invested) * 100).toFixed(2)) : 0;
    return { invested, current, gain, gainPct };
  }, [rows, agg, lastPriceBySymbol]);

  /* ---------- 1D (intraday) portfolio series from live session ---------- */
  const costBasis = React.useMemo(
    () => rows.reduce((s, r) => s + r.amountInvested, 0),
    [rows]
  );

  const rangeToMs = React.useMemo(() => {
    // used only for 1D slicing; long ranges use daily history
    return 15 * 60 * 1000; // header spark compression window; not critical now
  }, []);

  const portfolioSeries1D = React.useMemo(() => {
    // union times from all symbols in session
    const times = new Set<number>();
    series.forEach((arr) => arr.forEach((pt) => times.add(pt.t)));

    if (times.size === 0) {
      const t1 = Date.now() - 60000;
      const t2 = Date.now();
      let currentNow = 0;
      agg.forEach((a, sym) => {
        const p = lastPriceBySymbol.get(sym) ?? a.avgCost;
        currentNow += p * a.shares;
      });
      return [
        { t: t1, current: Number(currentNow.toFixed(2)), invested: Number(costBasis.toFixed(2)) },
        { t: t2, current: Number(currentNow.toFixed(2)), invested: Number(costBasis.toFixed(2)) },
      ];
    }

    const sorted = Array.from(times).sort((a, b) => a - b);
    const out = sorted.map((t) => {
      let sum = 0;
      agg.forEach((a, sym) => {
        const arr = series.get(sym) ?? [];
        let price = lastPriceBySymbol.get(sym) ?? a.avgCost;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].t <= t) {
            price = arr[i].price;
            break;
          }
        }
        sum += price * a.shares;
      });
      return { t, current: Number(sum.toFixed(2)), invested: Number(costBasis.toFixed(2)) };
    });
    // optionally slice to last N minutes (not strictly needed here)
    return sliceByRange(out, rangeToMs);
  }, [series, agg, lastPriceBySymbol, costBasis, rangeToMs]);

  const symbolSeries1D = React.useMemo(() => {
    if (!selectedSymbol) return [];
    const arr = series.get(selectedSymbol) ?? [];
    const base = lastPriceBySymbol.get(selectedSymbol) ?? 0;
    const seeded = arr.length
      ? arr
      : [
          { t: Date.now() - 60000, price: base },
          { t: Date.now(), price: base },
        ];
    const pos = agg.get(selectedSymbol);
    const shares = pos?.shares ?? 0;
    const invested = pos?.invested ?? 0;
    return seeded.map((p) => ({
      t: p.t,
      current: Number((p.price * shares).toFixed(2)),
      invested: Number(invested.toFixed(2)),
      price: p.price,
    }));
  }, [series, selectedSymbol, lastPriceBySymbol, agg]);

  /* ---------- Long ranges (1W, 1M, ...): fetch daily history & aggregate ---------- */
  const needHistory = range !== "1D";
  const fromISO = React.useMemo(
    () => startDateForRange(range).toISOString().slice(0, 10),
    [range]
  );
  const toISO = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data: history } = useQuery({
    queryKey: ["history", symbols.join(","), fromISO, toISO],
    queryFn: () => fetchHistory(token, { symbols, from: fromISO, to: toISO }),
    enabled: !!token && symbols.length > 0 && needHistory,
    staleTime: 60_000,
  });

  const histPerSymbol = React.useMemo(() => {
    if (!history?.series) return new Map<string, { t: string; close: number }[]>();
    const map = new Map<string, { t: string; close: number }[]>();
    Object.entries(history.series).forEach(([sym, rows]) => {
      let data = rows.sort((a, b) => a.t.localeCompare(b.t));
      if (interval === "monthly") data = groupMonthly(data);
      if (interval === "yearly") data = groupYearly(data);
      map.set(sym, data);
    });
    return map;
  }, [history?.series, interval]);

  const portfolioSeriesLong = React.useMemo(() => {
    if (!needHistory || !histPerSymbol.size) return [];

    // union all dates
    const dates = new Set<string>();
    histPerSymbol.forEach((arr) => arr.forEach((p) => dates.add(p.t)));
    const sortedDates = Array.from(dates).sort((a, b) => a.localeCompare(b));

    return sortedDates.map((d) => {
      let sum = 0;
      agg.forEach((pos, sym) => {
        const arr = histPerSymbol.get(sym) ?? [];
        // find last <= d
        let close = arr.length ? arr[0].close : seedPrices.get(sym) ?? 0;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].t <= d) {
            close = arr[i].close;
            break;
          }
        }
        sum += close * pos.shares;
      });
      return {
        t: new Date(d).getTime(),
        current: Number(sum.toFixed(2)),
        invested: Number(costBasis.toFixed(2)),
      };
    });
  }, [needHistory, histPerSymbol, agg, seedPrices, costBasis]);

  // choose which series powers the big chart
  const bigChartData = React.useMemo(() => {
    if (view === "overall") {
      return needHistory ? portfolioSeriesLong : portfolioSeries1D;
    }
    // specific symbol
    if (!selectedSymbol) return [];
    if (!needHistory) return symbolSeries1D;

    const arr = histPerSymbol.get(selectedSymbol) ?? [];
    const pos = agg.get(selectedSymbol);
    const shares = pos?.shares ?? 0;
    const invested = pos?.invested ?? 0;
    return arr.map((p) => ({
      t: new Date(p.t).getTime(),
      current: Number((p.close * shares).toFixed(2)),
      invested: Number(invested.toFixed(2)),
    }));
  }, [
    view,
    needHistory,
    portfolioSeriesLong,
    portfolioSeries1D,
    selectedSymbol,
    symbolSeries1D,
    histPerSymbol,
    agg,
  ]);

  // metrics driven by bigChartData
  const perfNow = React.useMemo(() => {
    const data = bigChartData;
    if (!data.length) return { current: 0, dayChange: 0, dayPct: 0, gain: 0, gainPct: 0 };
    const last = data[data.length - 1];
    const first = data[0];
    const change = Number((last.current - first.current).toFixed(2));
    const pct = first.current > 0 ? Number(((change / first.current) * 100).toFixed(2)) : 0;
    const basis =
      view === "overall" ? costBasis : agg.get(selectedSymbol || "")?.invested ?? 0;
    const totalGain = Number((last.current - basis).toFixed(2));
    const totalPct = basis > 0 ? Number(((totalGain / basis) * 100).toFixed(2)) : 0;
    return {
      current: last.current,
      dayChange: change,
      dayPct: pct,
      gain: totalGain,
      gainPct: totalPct,
    };
  }, [bigChartData, view, selectedSymbol, agg, costBasis]);

  // header sparkline (overall, quick glance)
  const headerSpark = React.useMemo(
    () => (needHistory ? portfolioSeriesLong : portfolioSeries1D).map(({ t, current }) => ({ t, value: current })),
    [needHistory, portfolioSeriesLong, portfolioSeries1D]
  );

  // allocation pie
  const pieData = React.useMemo(() => {
    const data: { name: string; value: number }[] = [];
    agg.forEach((a, sym) => {
      const p = lastPriceBySymbol.get(sym) ?? a.avgCost;
      data.push({ name: sym, value: Number((p * a.shares).toFixed(2)) });
    });
    data.sort((a, b) => b.value - a.value);
    return data;
  }, [agg, lastPriceBySymbol]);


  React.useEffect(() => {
  // `portfolio?.totals.current` is the server-computed current value at load-time
  const serverCurrent = portfolio?.totals?.current ?? 0;
  const liveCurrent = liveTotals.current ?? 0;
  const delta = Number((liveCurrent - serverCurrent).toFixed(2));

  // Include helpful details for listeners
  window.dispatchEvent(
    new CustomEvent("data:stocks:live", {
      detail: {
        livePortfolioCurrent: liveCurrent,
        serverPortfolioCurrent: serverCurrent,
        livePortfolioDelta: delta,
        timestamp: Date.now(),
      },
    })
  );
}, [liveTotals.current, portfolio?.totals?.current]);

  /* ==================== Render ==================== */
  return (
    <div className={glass}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Your Stock &amp; ETF Lots</h3>
        <div className="flex flex-wrap items-center gap-2">
          {/* view selector */}
          <select
            className="rounded-lg bg-white/10 text-white text-xs px-2 py-1 ring-1 ring-white/10"
            value={view}
            onChange={(e) => {
              const v = e.target.value as "overall" | "symbol";
              setView(v);
              if (v === "overall") setSelectedSymbol(null);
            }}
          >
            <option value="overall">Overall performance</option>
            <option value="symbol">Specific stock</option>
          </select>

          {/* symbol selector */}
          {view === "symbol" && (
            <select
              className="rounded-lg bg-white/10 text-white text-xs px-2 py-1 ring-1 ring-white/10"
              value={selectedSymbol ?? ""}
              onChange={(e) => setSelectedSymbol(e.target.value || null)}
            >
              <option value="">Pick a symbol…</option>
              {Array.from(agg.keys()).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          {/* range selector */}
          <select
            className="rounded-lg bg-white/10 text-white text-xs px-2 py-1 ring-1 ring-white/10"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
          >
            <option value="1D">1D</option>
            <option value="1W">1W</option>
            <option value="1M">1M</option>
            <option value="3M">3M</option>
            <option value="6M">6M</option>
            <option value="YTD">YTD</option>
            <option value="1Y">1Y</option>
            <option value="5Y">5Y</option>
            <option value="ALL">ALL</option>
          </select>

          {/* interval selector (disabled for 1D) */}
          <select
            className="rounded-lg bg-white/10 text-white text-xs px-2 py-1 ring-1 ring-white/10"
            value={interval}
            onChange={(e) => setInterval(e.target.value as IntervalKey)}
            disabled={range === "1D"}
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          {/* chart type toggle */}
          <div className="flex rounded-lg overflow-hidden ring-1 ring-white/10">
            <button
              className={`px-2 py-1 text-xs ${
                chartType === "line" ? "bg-white/20 text-white" : "bg-white/10 text-white/80"
              }`}
              onClick={() => setChartType("line")}
            >
              Line
            </button>
            <button
              className={`px-2 py-1 text-xs ${
                chartType === "pie" ? "bg-white/20 text-white" : "bg-white/10 text-white/80"
              }`}
              onClick={() => setChartType("pie")}
            >
              Pie
            </button>
          </div>

          {/* header sparkline */}
          <div className="hidden md:block w-44 h-8">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={headerSpark}>
                <Line type="monotone" dataKey="value" dot={false} strokeWidth={2} />
                <Tooltip
                  formatter={(v) => [`$${(v as number).toFixed(2)}`, "Portfolio"]}
                  labelFormatter={(t) => humanTime(t as number)}
                  contentStyle={{
                    background: "rgba(10,12,17,0.85)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["positions"] })}
            className="inline-flex items-center gap-1 text-xs text-white/80 hover:text-white"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs text-white/90 rounded-lg bg-white/10 px-2.5 py-1.5 hover:bg-white/15"
          >
            <PlusIcon className="h-4 w-4" /> Add lot
          </button>
        </div>
      </div>

      {/* Add lot form */}
      {open && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-[11px] text-white/60">Symbol</label>
              <input
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40 focus:outline-none focus:ring-white/20"
                value={sel?.symbol ?? query}
                onChange={(e) => {
                  setSel(null);
                  setQuery(e.target.value.toUpperCase());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sel && symbol) setSel({ symbol });
                }}
                placeholder="VOO, AAPL…"
              />
              {!!(picks && !sel && picks.length > 0) && (
                <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur">
                  {picks.slice(0, 8).map((r) => (
                    <button
                      key={`${r.symbol}-${r.name}`}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10"
                      onClick={() => {
                        setSel({ symbol: r.symbol, name: r.name });
                        setQuery(r.symbol);
                      }}
                    >
                      <span className="font-medium">{r.symbol}</span>{" "}
                      <span className="opacity-70">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] text-white/60">Amount invested</label>
              <input
                inputMode="decimal"
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40 focus:outline-none focus:ring-white/20"
                placeholder="1000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() =>
                  setAmount((a) => (a && isFinite(Number(a)) ? Number(a).toFixed(2) : a))
                }
              />
            </div>

            <div>
              <label className="text-[11px] text-white/60">Purchase date</label>
              <input
                type="date"
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40 focus:outline-none focus:ring-white/20"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => canSave && addMut.mutate()}
              disabled={!canSave || addMut.isPending}
              className="rounded-lg bg-emerald-500/90 px-3 py-2 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {addMut.isPending ? "Saving…" : "Save lot"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-xs text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Live totals */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-white/80">
          Invested: <b>${liveTotals.invested.toFixed(2)}</b>
        </span>
        <span className="text-white/80">
          Current: <b>${liveTotals.current.toFixed(2)}</b>
        </span>
        <span className={liveTotals.gain >= 0 ? "text-emerald-300" : "text-rose-300"}>
          P/L: <b>${liveTotals.gain.toFixed(2)} ({liveTotals.gainPct.toFixed(2)}%)</b>
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-white/70">
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-right">Shares</th>
              <th className="px-3 py-2 text-right">Buy @</th>
              <th className="px-3 py-2 text-right">Invested</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Current</th>
              <th className="px-3 py-2 text-right">P/L</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const livePrice =
                lastPriceBySymbol.get(r.symbol) ?? (r.currentPrice ?? r.purchasePrice);
              const currentValue = Number((livePrice * r.shares).toFixed(2));
              const gain = Number((currentValue - r.amountInvested).toFixed(2));
              const gainPct =
                r.amountInvested > 0
                  ? Number(((gain / r.amountInvested) * 100).toFixed(2))
                  : 0;
              const gainClass = gain >= 0 ? "text-emerald-300" : "text-rose-300";
              const rowSeries = (series.get(r.symbol) ?? []).map((p) => ({
                t: p.t,
                price: p.price,
              }));

              return (
                <tr key={r._id} className="border-t border-white/10">
                  <td className="px-3 py-2">
                    <div className="font-medium text-white">{r.symbol}</div>
                    {r.name && <div className="text-xs text-white/60">{r.name}</div>}
                    <div className="text-[11px] text-white/50">
                      Date: {new Date(r.purchaseDate).toISOString().slice(0, 10)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{r.shares.toFixed(4)}</td>
                  <td className="px-3 py-2 text-right">${r.purchasePrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">${r.amountInvested.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <PriceCell price={livePrice} />
                  </td>
                  <td className="px-3 py-2 text-right">${currentValue.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right ${gainClass}`}>
                    ${gain.toFixed(2)} ({gainPct.toFixed(2)}%)
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-block w-28 h-8 align-middle">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rowSeries}>
                          <Line type="monotone" dataKey="price" dot={false} strokeWidth={2} />
                          <Tooltip
                            labelFormatter={() => ""}
                            formatter={(v) => [`$${(v as number).toFixed(2)}`, r.symbol]}
                            contentStyle={{
                              background: "rgba(10,12,17,0.85)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 12,
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <button
                      onClick={() => delMut.mutate(r._id)}
                      className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/80 hover:text-white hover:bg-white/10"
                    >
                      <TrashIcon className="h-4 w-4" /> Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-white/60">
                  No positions yet. Add your first lot above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Big chart (Line / Pie) */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-sm text-white/60">
              {view === "overall" ? "Portfolio value" : `${selectedSymbol ?? "Symbol"} value`}
            </div>
            <div className="text-2xl font-semibold text-white">
              ${Number(perfNow.current ?? 0).toLocaleString()}
            </div>
          </div>

          {(view === "overall" || selectedSymbol) && (
            <div className="text-right">
              <div
                className={`${
                  (perfNow.dayChange ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                } text-sm`}
              >
                {perfNow.dayChange! >= 0 ? "+" : ""}${(perfNow.dayChange ?? 0).toLocaleString()} (
                {(perfNow.dayPct ?? 0).toFixed(2)}% in range)
              </div>
              <div
                className={`${
                  (perfNow.gain ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                } text-xs`}
              >
                Total P/L: {perfNow.gain! >= 0 ? "+" : ""}${(perfNow.gain ?? 0).toLocaleString()} (
                {(perfNow.gainPct ?? 0).toFixed(2)}%)
              </div>
            </div>
          )}
        </div>

        {chartType === "line" ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bigChartData}>
                <defs>
                  <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => humanTime(t as number)}
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.15)" }}
                />
                <YAxis
                  tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                  width={70}
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.15)" }}
                />
                <Tooltip
                  formatter={(v, name) =>
                    name === "current"
                      ? [`$${Number(v as number).toLocaleString()}`, "Current"]
                      : name === "invested"
                      ? [`$${Number(v as number).toLocaleString()}`, "Invested"]
                      : [`$${Number(v as number).toLocaleString()}`, name as string]
                  }
                  labelFormatter={(t) => humanTime(t as number)}
                  contentStyle={{
                    background: "rgba(10,12,17,0.85)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                  }}
                />

                <ReferenceLine
                  y={view === "overall" ? costBasis : agg.get(selectedSymbol || "")?.invested ?? 0}
                  stroke="rgba(255,255,255,0.25)"
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />

                <Area
                  type="monotone"
                  dataKey="current"
                  stroke="currentColor"
                  fill="url(#pv)"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="invested"
                  dot={false}
                  strokeWidth={1.75}
                  stroke="rgba(255,255,255,0.35)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  formatter={(v, n) => [`$${Number(v as number).toLocaleString()}`, n as string]}
                  contentStyle={{
                    background: "rgba(10,12,17,0.85)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                  }}
                />
                <Legend />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  // guard percent to avoid TS18048
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
