// frontend/src/components/widgets/CryptoPortfolioWidget.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useCryptoLivePortfolio,
  useCryptoLiveSeries,
  useCryptoLiveTick,
  useAddLot,
  useUpdateLot,
  useDeleteLot,
  useUpsertHolding,
  useCryptoPnlSeries,
  useCryptoPriceSeries,
  useCommaNumber,
  StreamPriceRow,
} from "../../hooks/cryptoHooks";
import type { CryptoHolding, CryptoLot } from "../../api/crypto";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

/* ------------------------------- Helpers ------------------------------- */
const timeframes = [
  { key: "1H", ms: 1 * 60 * 60 * 1000 },
  { key: "24H", ms: 24 * 60 * 60 * 1000 },
  { key: "7D", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30D", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "1Y", ms: 365 * 24 * 60 * 60 * 1000 },
  { key: "MAX", ms: Infinity },
] as const;

function fmtMoney(n?: number | null) {
  if (n == null || Number.isNaN(n)) return "$0";
  return "$" + (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : Number(n).toFixed(2));
}
function fmtNum(n?: number | null) {
  if (n == null || Number.isNaN(n)) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(n);
}

/* ------------------------------ UI Shells ------------------------------ */
function Card({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={["rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-2xl backdrop-blur", className].join(" ")}>
      {children}
    </div>
  );
}
function Modal({
  open,
  onClose,
  title,
  children,
}: React.PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-4 mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </Card>
    </div>
  );
}

/* ------------------------------- Main UI ------------------------------- */
export default function CryptoPortfolioWidget({ accountId }: { accountId?: string }) {
  const { data, isLoading, isError } = useCryptoLivePortfolio(accountId);
  const liveTick = useCryptoLiveTick(accountId); // per-tick payload for truly live charts
  const series = useCryptoLiveSeries(accountId); // tiny sparkline (top)

  const addLot = useAddLot();
  const updateLot = useUpdateLot();
  const deleteLot = useDeleteLot();
  const upsert = useUpsertHolding();

  // selection & timeframe
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | "ALL">("ALL");
  const [tf, setTf] = useState<(typeof timeframes)[number]>(timeframes[1]); // default 24H

  // chart line visibility toggles
  const [showValue, setShowValue] = useState(true);
  const [showInvested, setShowInvested] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [showPnl, setShowPnl] = useState(true);

  // modal state
  const [holdingModal, setHoldingModal] = useState<{ open: boolean; initial?: Partial<CryptoHolding> }>({ open: false });
  const [lotModal, setLotModal] = useState<{ open: boolean; holdingId?: string; initial?: Partial<CryptoLot> }>({
    open: false,
  });

  const total = data?.summary.totalUSD ?? 0;

  // keep focused holding sensible
  const firstId = data?.holdings?.[0]?._id ?? "ALL";
  useEffect(() => {
    if (!data) return;
    if (selectedHoldingId !== "ALL") {
      const exists = data.holdings.some((h) => h._id === selectedHoldingId);
      if (!exists) setSelectedHoldingId("ALL");
    } else if (!data.holdings?.length) {
      setSelectedHoldingId("ALL");
    }
  }, [data, selectedHoldingId]);

  // For individual holding chart: fetch PnL timeline (invested vs value) or fallback to raw price
  const focusedHolding = useMemo(
    () => (selectedHoldingId === "ALL" ? null : data?.holdings.find((h) => h._id === selectedHoldingId) ?? null),
    [data, selectedHoldingId]
  );
  const { data: pnlData } = useCryptoPnlSeries(focusedHolding?._id || undefined, 365);
  const pnlSeries = pnlData?.series ?? [];

  const { data: priceSeriesData } = useCryptoPriceSeries(focusedHolding?.cgId || undefined, 365);
  const priceSeries = priceSeriesData?.series ?? [];

  /* ------------------------ Build live chart timeseries ------------------------ */
  type Point = { t: number; value?: number; invested?: number; price?: number; pnl?: number };
  const [liveSeries, setLiveSeries] = useState<Point[]>([]);
  const maxMs = tf.ms;

  const baselineValueRef = useRef<number | null>(null); // used for P&L area baseline in ALL mode

  useEffect(() => {
    // reset when timeframe changes or selection changes
    setLiveSeries([]);
    baselineValueRef.current = null;
  }, [selectedHoldingId, tf]);

  useEffect(() => {
    if (!liveTick) return;
    const now = liveTick.ts;

    if (selectedHoldingId === "ALL") {
      const v = liveTick.totalUSD ?? 0;
      if (baselineValueRef.current == null) baselineValueRef.current = v;
      setLiveSeries((prev) => {
        const next = [...prev, { t: now, value: v, pnl: v - (baselineValueRef.current ?? v) }];
        const cutoff = maxMs === Infinity ? 0 : now - maxMs;
        return next.filter((p) => p.t >= cutoff);
      });
    } else if (focusedHolding) {
      const row = liveTick.rows.get(String(selectedHoldingId)) as StreamPriceRow | undefined;
      const price = row?.price ?? focusedHolding.price ?? 0;
      const qty = row?.quantity ?? focusedHolding.quantity ?? 0;
      const v = (row?.value != null ? row.value : qty * price) ?? 0;

      setLiveSeries((prev) => {
        const next = [...prev, { t: now, value: v, price }];
        const cutoff = maxMs === Infinity ? 0 : now - maxMs;
        return next.filter((p) => p.t >= cutoff);
      });
    }
  }, [liveTick, selectedHoldingId, focusedHolding, maxMs]);

  /* --------------------------- Compose chart data --------------------------- */
  const composedData = useMemo(() => {
    if (selectedHoldingId === "ALL") {
      return liveSeries.map((p) => ({
        t: p.t,
        value: p.value ?? 0,
        pnl: p.pnl ?? 0,
      }));
    }

    const byT: Record<number, Point> = {};
    for (const p of liveSeries) byT[p.t] = { ...(byT[p.t] || {}), t: p.t, value: p.value, price: p.price };

    if (pnlSeries.length > 0) {
      for (const p of pnlSeries) {
        const key = p.t;
        const obj = byT[key] || { t: key };
        obj.invested = p.invested;
        obj.value = obj.value ?? p.value;
        obj.pnl = p.pnl;
        byT[key] = obj;
      }
    } else if (priceSeries.length > 0 && focusedHolding) {
      for (const p of priceSeries) {
        const key = p.t;
        const obj = byT[key] || { t: key };
        obj.price = obj.price ?? p.price;
        obj.value = obj.value ?? (focusedHolding.quantity ?? 0) * p.price;
        byT[key] = obj;
      }
    }

    const rows = Object.values(byT).sort((a, b) => a.t - b.t);
    const now = Date.now();
    const cutoff = maxMs === Infinity ? 0 : now - maxMs;
    return rows.filter((r) => r.t >= cutoff);
  }, [selectedHoldingId, liveSeries, pnlSeries, priceSeries, maxMs, focusedHolding]);

  // Stats for header (change/percent over window)
  const headerStats = useMemo(() => {
    if (!composedData.length) return { change: 0, pct: 0 };
    const first = composedData[0];
    const last = composedData[composedData.length - 1];
    const a = first.value ?? 0;
    const b = last.value ?? 0;
    const change = b - a;
    const pct = a > 0 ? (change / a) * 100 : 0;
    return { change, pct };
  }, [composedData]);

  /* --------------------------- Modal open helpers --------------------------- */
  const openNewHolding = () => setHoldingModal({ open: true });
  const openEditHolding = (h: CryptoHolding) =>
    setHoldingModal({
      open: true,
      initial: {
        _id: h._id,
        name: h.name,
        symbol: h.symbol,
        cgId: h.cgId,
        accountId: h.accountId ?? undefined,
        quantity: h.quantity,
      } as any,
    });

  const openNewLot = (holdingId: string) => setLotModal({ open: true, holdingId });
  const openEditLot = (holdingId: string, lot: CryptoLot) =>
    setLotModal({ open: true, holdingId, initial: lot });

  /* --------------------------------- Render --------------------------------- */
  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
        <div>
          <div className="text-xs text-white/60">Crypto Portfolio</div>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-semibold">{fmtMoney(total)}</div>
            <div
              className={
                "text-sm " +
                (headerStats.change > 0 ? "text-emerald-300" : headerStats.change < 0 ? "text-rose-300" : "text-white/70")
              }
            >
              {headerStats.change >= 0 ? "+" : ""}
              {fmtMoney(headerStats.change)} ({headerStats.pct >= 0 ? "+" : ""}
              {headerStats.pct.toFixed(2)}%)
            </div>
          </div>
          {accountId && <div className="text-xs text-white/50 mt-0.5">Filtered to account: {accountId}</div>}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Holding selector */}
          <div className="relative">
            <select
              value={selectedHoldingId}
              onChange={(e) => setSelectedHoldingId(e.target.value as any)}
              className="appearance-none bg-white/10 rounded-lg px-3 py-2 pr-8 text-sm"
            >
              <option value="ALL">All crypto</option>
              {(data?.holdings ?? []).map((h) => (
                <option key={h._id} value={h._id}>
                  {h.symbol || h.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
          </div>

          {/* Timeframe */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
            {timeframes.map((t) => (
              <button
                key={t.key}
                onClick={() => setTf(t)}
                className={
                  "px-2 py-1 rounded-md text-xs " + (tf.key === t.key ? "bg-white text-black" : "hover:bg-white/10")
                }
              >
                {t.key}
              </button>
            ))}
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
            <Toggle label="Value" checked={showValue} onChange={setShowValue} />
            <Toggle label="Invested" checked={showInvested} onChange={setShowInvested} disabled={selectedHoldingId === "ALL"} />
            <Toggle label="Price" checked={showPrice} onChange={setShowPrice} />
            <Toggle label="P&L" checked={showPnl} onChange={setShowPnl} />
          </div>

          {/* Add holding */}
          <button
            onClick={openNewHolding}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm bg-emerald-500/20 hover:bg-emerald-500/25 ring-1 ring-emerald-400/30 text-emerald-200"
          >
            <PlusIcon className="h-4 w-4" /> Add Holding
          </button>
        </div>
      </div>

      {/* Top tiny sparkline (sharp, no glow) */}
      <div className="h-20 rounded-xl ring-1 ring-white/10 bg-white/[0.04] px-2 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series.map((p) => ({ t: p.t, v: p.v }))}>
            <XAxis dataKey="t" type="number" hide domain={["dataMin", "dataMax"]} />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "rgba(17, 24, 39, 0.85)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                color: "#fff",
              }}
              formatter={(v: any) => [fmtMoney(Number(v)), "Total"]}
              labelFormatter={(ts) => new Date(Number(ts)).toLocaleTimeString()}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="#A855F7"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Main chart (sharp lines, toned-down fills) */}
      <div className="h-72 rounded-xl ring-1 ring-white/10 bg-white/[0.04] px-2 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={composedData}>
            <defs>
              <linearGradient id="grad-value" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="grad-invested" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="grad-pnl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />

            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts) => new Date(Number(ts)).toLocaleTimeString()}
              tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.18)" }}
              tickLine={{ stroke: "rgba(255,255,255,0.18)" }}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => "$" + (Math.abs(v) >= 1000 ? Number(v).toLocaleString() : Number(v).toFixed(0))}
              tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.18)" }}
              tickLine={{ stroke: "rgba(255,255,255,0.18)" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? Number(v).toLocaleString() : Number(v).toFixed(2))}
              tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.18)" }}
              tickLine={{ stroke: "rgba(255,255,255,0.18)" }}
            />

            <Tooltip
              contentStyle={{
                background: "rgba(17, 24, 39, 0.88)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                color: "#fff",
              }}
              formatter={(v: any, k: string) => {
                if (k === "price") return [fmtNum(Number(v)), "Price"];
                if (k === "invested") return [fmtMoney(Number(v)), "Invested"];
                if (k === "pnl") return [fmtMoney(Number(v)), "P&L (vs window start)"];
                return [fmtMoney(Number(v)), "Value"];
              }}
              labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
            />

            {showPnl && <ReferenceLine y={0} yAxisId="left" stroke="rgba(255,255,255,0.25)" />}

            {/* Invested */}
            {showInvested && selectedHoldingId !== "ALL" && (
              <>
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="invested"
                  stroke="#93C5FD"
                  fill="url(#grad-invested)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="invested"
                  stroke="#93C5FD"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                />
              </>
            )}

            {/* Value */}
            {showValue && (
              <>
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="value"
                  fill="url(#grad-value)"
                  stroke="#A855F7"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="value"
                  stroke="#A855F7"
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                />
              </>
            )}

            {/* Price */}
            {showPrice && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="price"
                stroke="#F59E0B"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
            )}

            {/* P&L (ALL mode baseline) */}
            {showPnl && selectedHoldingId === "ALL" && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="pnl"
                fill="url(#grad-pnl)"
                stroke="#10B981"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-white/60">
            <tr className="border-b border-white/10">
              <th className="text-left py-2 pr-2 font-medium">Asset</th>
              <th className="text-right py-2 px-2 font-medium">Qty</th>
              <th className="text-right py-2 px-2 font-medium">Price</th>
              <th className="text-right py-2 px-2 font-medium">Value</th>
              <th className="text-right py-2 px-2 font-medium">P&L</th>
              <th className="py-2 pl-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-white/60">
                  Loading…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-rose-300">
                  Failed to load portfolio.
                </td>
              </tr>
            )}
            {!isLoading && !isError && (data?.holdings ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-white/60">
                  No holdings yet.
                </td>
              </tr>
            )}

            {(data?.holdings ?? []).map((h: CryptoHolding) => {
              const pnl = h.pnl ?? 0;
              const pnlPct = h.pnlPct ?? null;
              const pnlColor = pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-white/70";
              return (
                <React.Fragment key={h._id}>
                  <tr
                    className={
                      "border-b border-white/10 hover:bg-white/[0.04] transition " +
                      (selectedHoldingId === h._id ? "bg-white/[0.04]" : "")
                    }
                  >
                    <td className="py-2 pr-2 cursor-pointer" onClick={() => setSelectedHoldingId(h._id)}>
                      <div className="font-medium">{h.symbol || h.name}</div>
                      <div className="text-xs text-white/50">{h.name}</div>
                    </td>
                    <td className="py-2 px-2 text-right">{fmtNum(h.quantity)}</td>
                    <td className="py-2 px-2 text-right">{fmtMoney(h.price)}</td>
                    <td className="py-2 px-2 text-right font-medium">{fmtMoney(h.value)}</td>
                    <td className={"py-2 px-2 text-right font-medium " + pnlColor}>
                      {pnl >= 0 ? "+" : ""}
                      {fmtMoney(pnl)}
                      {pnlPct != null && (
                        <span className="text-white/50">
                          {" "}
                          ({pnlPct >= 0 ? "+" : ""}
                          {Number(pnlPct).toFixed(2)}%)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openNewLot(h._id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
                          title="Add lot"
                        >
                          <PlusIcon className="h-4 w-4" /> Lot
                        </button>
                        <button
                          onClick={() => openEditHolding(h)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
                          title="Edit holding"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Lots */}
                  {Array.isArray(h.lots) && h.lots.length > 0 && (
                    <tr className="border-b border-white/10">
                      <td colSpan={6} className="bg-white/[0.03]">
                        <LotsRow
                          lots={h.lots}
                          holdingId={h._id}
                          onInlineEdit={(lot) => openEditLot(h._id, lot)}
                          onDelete={(lotId) => deleteLot.mutate({ id: h._id, lotId })}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <HoldingFormModal
        open={holdingModal.open}
        initial={holdingModal.initial}
        onClose={() => setHoldingModal({ open: false })}
        onSave={(payload) =>
          upsert.mutate(payload, {
            onSuccess: () => setHoldingModal({ open: false }),
          })
        }
      />
      <LotFormModal
        open={lotModal.open}
        holdingId={lotModal.holdingId!}
        initial={lotModal.initial}
        onClose={() => setLotModal({ open: false })}
        onSave={(lot) => {
          if (lot._id) {
            updateLot.mutate(
              {
                id: lotModal.holdingId!,
                lotId: String(lot._id),
                purchasedAt: lot.purchasedAt,
                quantity: lot.quantity!,
                unitCostUSD: lot.unitCostUSD,
                note: lot.note,
              },
              { onSuccess: () => setLotModal({ open: false }) }
            );
          } else {
            addLot.mutate(
              {
                id: lotModal.holdingId!,
                purchasedAt: lot.purchasedAt,
                quantity: lot.quantity!,
                unitCostUSD: lot.unitCostUSD,
                note: lot.note,
              },
              { onSuccess: () => setLotModal({ open: false }) }
            );
          }
        }}
      />
    </Card>
  );
}

/* ---------------------------- Small components ---------------------------- */
function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={
        "px-2 py-1 rounded-md text-xs " +
        (disabled ? "opacity-40 cursor-not-allowed " : "") +
        (checked ? "bg-white text-black" : "hover:bg-white/10")
      }
    >
      {label}
    </button>
  );
}

function LotsRow({
  lots,
  holdingId,
  onInlineEdit,
  onDelete,
}: {
  lots: CryptoLot[];
  holdingId: string;
  onInlineEdit: (lot: CryptoLot) => void;
  onDelete: (lotId: string) => void;
}) {
  return (
    <div className="p-3">
      <div className="text-xs text-white/60 mb-2">Lots</div>
      <div className="rounded-xl overflow-hidden ring-1 ring-white/10">
        <table className="min-w-full text-xs bg-white/[0.02]">
          <thead className="text-white/50">
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-2">Purchased</th>
              <th className="text-right py-2 px-2">Qty</th>
              <th className="text-right py-2 px-2">Unit Cost</th>
              <th className="text-right py-2 px-2">Cost Basis</th>
              <th className="text-right py-2 px-2">Value Now</th>
              <th className="text-right py-2 px-2">P&L</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {(lots ?? []).map((l) => {
              const pnl = l.pnl ?? 0;
              const pnlColor = pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-white/70";
              return (
                <tr key={l._id} className="border-b border-white/10">
                  <td className="py-2 px-2">{l.purchasedAt ? new Date(l.purchasedAt).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-2 text-right">{fmtNum(l.quantity)}</td>
                  <td className="py-2 px-2 text-right">{l.unitCostUSD != null ? fmtMoney(l.unitCostUSD) : "—"}</td>
                  <td className="py-2 px-2 text-right">{fmtMoney(l.costBasis)}</td>
                  <td className="py-2 px-2 text-right">{fmtMoney(l.valueNow)}</td>
                  <td className={"py-2 px-2 text-right font-medium " + pnlColor}>
                    {pnl >= 0 ? "+" : ""}
                    {fmtMoney(pnl)}
                    {l.pnlPct != null && (
                      <span className="text-white/50">
                        {" "}
                        ({l.pnlPct >= 0 ? "+" : ""}
                        {Number(l.pnlPct).toFixed(2)}%)
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onInlineEdit(l)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
                      >
                        <PencilSquareIcon className="h-4 w-4" /> Edit
                      </button>
                      <button
                        onClick={() => onDelete(String(l._id))}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 ring-1 ring-rose-400/30 text-rose-200"
                      >
                        <TrashIcon className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(lots ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-center text-white/60">
                  No lots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Forms ------------------------------- */
function HoldingFormModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: Partial<CryptoHolding>;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [cgId, setCgId] = useState(initial?.cgId ?? "");
  const qty = useCommaNumber(initial?.quantity != null ? String(initial.quantity) : "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");

  useEffect(() => {
    setName(initial?.name ?? "");
    setSymbol(initial?.symbol ?? "");
    setCgId(initial?.cgId ?? "");
    qty.setRaw(initial?.quantity != null ? String(initial.quantity) : "");
    setAccountId(initial?.accountId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?._id,
      kind: "crypto",
      source: "manual",
      accountScope: accountId ? "account" : "global",
      accountId: accountId || null,
      name,
      symbol,
      cgId: cgId || null,
      quantity: qty.value,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?._id ? "Edit Holding" : "Add Holding"}>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-1">
          <label className="text-xs text-white/60">Name</label>
          <input className="bg-white/10 rounded-lg px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bitcoin" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-white/60">Symbol</label>
          <input className="bg-white/10 rounded-lg px-3 py-2" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-white/60">CoinGecko ID</label>
          <input className="bg-white/10 rounded-lg px-3 py-2" value={cgId} onChange={(e) => setCgId(e.target.value)} placeholder="bitcoin" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-white/60">Quantity</label>
          <input className="bg-white/10 rounded-lg px-3 py-2" value={qty.raw} onChange={qty.onChange} placeholder="0.50" />
          <div className="text-xs text-white/50">We’ll compute value using live price.</div>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-white/60">Account ID (optional)</label>
          <input className="bg-white/10 rounded-lg px-3 py-2" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="acc_123" />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15">
            Cancel
          </button>
          <button type="submit" className="px-3 py-2 rounded-lg bg-white text-black hover:opacity-90">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LotFormModal({
  open,
  holdingId,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  holdingId: string;
  initial?: Partial<CryptoLot>;
  onClose: () => void;
  onSave: (lot: Partial<CryptoLot> & { _id?: string }) => void;
}) {
  const [purchasedAt, setPurchasedAt] = useState<string>(initial?.purchasedAt ? initial.purchasedAt.slice(0, 10) : "");
  const qty = useCommaNumber(initial?.quantity != null ? String(initial.quantity) : "");
  const unit = useCommaNumber(initial?.unitCostUSD != null ? String(initial.unitCostUSD) : "");
  const [note, setNote] = useState<string>((initial as any)?.note ?? "");

  useEffect(() => {
    setPurchasedAt(initial?.purchasedAt ? initial.purchasedAt.slice(0, 10) : "");
    qty.setRaw(initial?.quantity != null ? String(initial.quantity) : "");
    unit.setRaw(initial?.unitCostUSD != null ? String(initial.unitCostUSD) : "");
    setNote((initial as any)?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qty.value || qty.value <= 0) {
      alert("Quantity must be > 0");
      return;
    }
    onSave({
      _id: initial?._id ? String(initial._id) : undefined,
      purchasedAt: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
      quantity: qty.value,
      unitCostUSD: unit.value,
      note: note?.trim() || undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?._id ? "Edit Lot" : "Add Lot"}>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-1">
          <label className="text-xs text-white/60">Purchase Date</label>
          <input type="date" className="bg-white/10 rounded-lg px-3 py-2" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label className="text-xs text-white/60">Quantity</label>
            <input className="bg-white/10 rounded-lg px-3 py-2" value={qty.raw} onChange={qty.onChange} placeholder="0.25" />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-white/60">Unit Cost (USD, optional)</label>
            <input className="bg-white/10 rounded-lg px-3 py-2" value={unit.raw} onChange={unit.onChange} placeholder="62000" />
          </div>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-white/60">Note (optional)</label>
          <input className="bg-white/10 rounded-lg px-3 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bought after pullback" />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15">
            Cancel
          </button>
          <button type="submit" className="px-3 py-2 rounded-lg bg-white text-black hover:opacity-90">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
