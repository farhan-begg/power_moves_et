// frontend/src/components/widgets/CryptoPortfolioWidget.tsx
// ^^^ file name

import React, { useEffect, useMemo, useState } from "react";
import {
  useCryptoLivePortfolio,
  useCryptoLiveSeries,
  useCryptoPriceSeries,
  useAddLot,
  useUpdateLot,
  useDeleteLot,
  useUpsertHolding,
  useCryptoPnlSeries, // (optional; not used in this version)
  useCommaNumber,
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
  Bar,
  Customized,
} from "recharts";

/* ------------------------------- Helpers ------------------------------- */
const timeframes = [
  { key: "1D", ms: 1 * 24 * 60 * 60 * 1000, bucket: 15 * 60 * 1000 },
  { key: "1W", ms: 7 * 24 * 60 * 60 * 1000, bucket: 2 * 60 * 60 * 1000 },
  { key: "1M", ms: 30 * 24 * 60 * 60 * 1000, bucket: 6 * 60 * 60 * 1000 },
  { key: "6M", ms: 182 * 24 * 60 * 60 * 1000, bucket: 24 * 60 * 60 * 1000 },
  { key: "YTD", ms: Infinity, bucket: 24 * 60 * 60 * 1000 },
] as const;

type PricePoint = { t: number; price: number; vol?: number };
type Candle = { t: number; o: number; h: number; l: number; c: number; vol?: number };

function fmtMoney(n?: number | null) {
  if (n == null || Number.isNaN(n)) return "$0";
  return "$" + (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : Number(n).toFixed(2));
}
function fmtNum(n?: number | null) {
  if (n == null || Number.isNaN(n)) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(n);
}

function buildCandles(points: PricePoint[], bucketMs: number, windowMs: number): Candle[] {
  if (!points?.length) return [];
  const now = Date.now();
  const start = windowMs === Infinity ? points[0].t : Math.max(points[0].t, now - windowMs);

  const map = new Map<number, Candle>();
  for (const p of points) {
    if (p.t < start) continue;
    const bucket = Math.floor(p.t / bucketMs) * bucketMs;
    const cur = map.get(bucket);
    if (!cur) {
      map.set(bucket, { t: bucket, o: p.price, h: p.price, l: p.price, c: p.price, vol: p.vol ?? 0 });
    } else {
      cur.h = Math.max(cur.h, p.price);
      cur.l = Math.min(cur.l, p.price);
      cur.c = p.price;
      cur.vol = (cur.vol ?? 0) + (p.vol ?? 0);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

/* ------------------------------ Glass Shell ------------------------------ */
function Card({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  // Glassmorphism: translucent gray, blur, subtle border + shadow (same vibe as your other widgets)
  return (
    <div
      className={[
        "rounded-2xl bg-white/[0.06] backdrop-blur-xl",
        "ring-1 ring-white/15 shadow-[0_10px_40px_rgba(0,0,0,0.35)]",
        className,
      ].join(" ")}
    >
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
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
  const series = useCryptoLiveSeries(accountId); // used for total sparkline

  const addLot = useAddLot();
  const updateLot = useUpdateLot();
  const deleteLot = useDeleteLot();
  const upsert = useUpsertHolding();

  // filter: ALL (portfolio area) or a specific holding (candles)
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | "ALL">("ALL");
  const [tf, setTf] = useState<(typeof timeframes)[number]>(timeframes[1]); // default 1W

  const total = data?.summary.totalUSD ?? 0;

  useEffect(() => {
    if (!data) return;
    if (selectedHoldingId !== "ALL") {
      const exists = data.holdings.some((h) => h._id === selectedHoldingId);
      if (!exists) setSelectedHoldingId("ALL");
    }
  }, [data, selectedHoldingId]);

  const focusedHolding = useMemo(
    () => (selectedHoldingId === "ALL" ? null : data?.holdings.find((h) => h._id === selectedHoldingId) ?? null),
    [data, selectedHoldingId]
  );

  // for an individual coin, pull price series and bucket into candles
  const { data: priceSeriesData } = useCryptoPriceSeries(
    focusedHolding?.cgId || undefined,
    tf.key === "YTD" ? "max" : 365
  );
  const rawPricePoints: PricePoint[] = useMemo(
    () => (priceSeriesData?.series ?? []).map((p: any) => ({ t: p.t, price: p.price, vol: p.vol })),
    [priceSeriesData]
  );
  const candles = useMemo(
    () => (focusedHolding ? buildCandles(rawPricePoints, tf.bucket, tf.ms) : []),
    [rawPricePoints, focusedHolding, tf]
  );

  // portfolio value line for ALL view
  const portfolioLine = useMemo(() => {
    const cutoff = tf.ms === Infinity ? 0 : Date.now() - tf.ms;
    return series
      .filter((p) => tf.ms === Infinity || p.t >= cutoff)
      .map((p) => ({ t: p.t, value: p.v }));
  }, [series, tf]);

  const headerStats = useMemo(() => {
    const arr =
      selectedHoldingId === "ALL"
        ? portfolioLine
        : candles.map((c) => ({ t: c.t, value: c.c }));
    if (!arr.length) return { change: 0, pct: 0 };
    const a = arr[0].value ?? 0;
    const b = arr[arr.length - 1].value ?? 0;
    const change = b - a;
    const pct = a > 0 ? (change / a) * 100 : 0;
    return { change, pct };
  }, [portfolioLine, candles, selectedHoldingId]);

  // modals
  const [holdingModal, setHoldingModal] = useState<{ open: boolean; initial?: Partial<CryptoHolding> }>({ open: false });
  const [lotModal, setLotModal] = useState<{ open: boolean; holdingId?: string; initial?: Partial<CryptoLot> }>({ open: false });
  const openNewHolding = () => setHoldingModal({ open: true });
  const openEditHolding = (h: CryptoHolding) =>
    setHoldingModal({ open: true, initial: { _id: h._id, name: h.name, symbol: h.symbol, cgId: h.cgId, accountId: h.accountId ?? undefined, quantity: h.quantity } as any });
  const openNewLot = (holdingId: string) => setLotModal({ open: true, holdingId });
  const openEditLot = (holdingId: string, lot: CryptoLot) => setLotModal({ open: true, holdingId, initial: lot });

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
        <div>
          <div className="text-xs text-white/70">
            {focusedHolding ? `${focusedHolding.symbol || focusedHolding.name} / USD` : "Total Crypto / USD"}
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-semibold">{fmtMoney(total)}</div>
            <div className={"text-sm " + (headerStats.change > 0 ? "text-emerald-300" : headerStats.change < 0 ? "text-rose-300" : "text-white/70")}>
              {headerStats.change >= 0 ? "+" : ""}
              {fmtMoney(headerStats.change)} ({headerStats.pct >= 0 ? "+" : ""}
              {headerStats.pct.toFixed(2)}%)
            </div>
          </div>
          <div className="text-[11px] text-white/50 mt-0.5">{new Date().toLocaleString()}</div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={selectedHoldingId}
              onChange={(e) => setSelectedHoldingId(e.target.value as any)}
              className="appearance-none bg-white/10 rounded-lg px-3 py-2 pr-8 text-sm ring-1 ring-white/10"
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

          <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1 ring-1 ring-white/10">
            {timeframes.map((t) => (
              <button
                key={t.key}
                onClick={() => setTf(t)}
                className={"px-2 py-1 rounded-md text-xs " + (tf.key === t.key ? "bg-white text-black" : "hover:bg-white/10")}
              >
                {t.key}
              </button>
            ))}
          </div>

          <button
            onClick={openNewHolding}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm bg-emerald-500/20 hover:bg-emerald-500/25 ring-1 ring-emerald-400/30 text-emerald-200"
          >
            <PlusIcon className="h-4 w-4" /> Add Holding
          </button>
        </div>
      </div>

      {/* Tiny sparkline (sharp line, no glow) */}
      <div className="h-18 rounded-xl ring-1 ring-white/10 bg-white/[0.05] px-2 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series.map((p) => ({ t: p.t, v: p.v }))}>
            <XAxis dataKey="t" type="number" hide domain={["dataMin", "dataMax"]} />
            <YAxis hide domain={["auto", "auto"]} />
            <Line type="monotone" dataKey="v" stroke="#A855F7" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Main chart area (glass background retained) */}
      <div className="h-72 rounded-xl ring-1 ring-white/10 bg-white/[0.05] px-2 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          {selectedHoldingId === "ALL" ? (
            <ComposedChart key={`ALL-${tf.key}`} data={portfolioLine}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(ts) => new Date(Number(ts)).toLocaleDateString()} tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }} />
              <YAxis tickFormatter={(v) => "$" + (Math.abs(v) >= 1000 ? Number(v).toLocaleString() : Number(v).toFixed(0))} tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "rgba(17, 24, 39, 0.88)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff" }} formatter={(v: any) => [fmtMoney(Number(v)), "Value"]} labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()} />
              <Area type="monotone" dataKey="value" stroke="#A855F7" fill="url(#grad-value)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <defs>
                <linearGradient id="grad-value" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
            </ComposedChart>
          ) : (
            <ComposedChart key={`${selectedHoldingId}-${tf.key}`} data={candles}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(ts) => new Date(Number(ts)).toLocaleDateString()} tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }} />
              <YAxis yAxisId="left" tickFormatter={(v) => (Math.abs(v) >= 1000 ? Number(v).toLocaleString() : Number(v).toFixed(2))} tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" hide />
              <Tooltip
                contentStyle={{ background: "rgba(17, 24, 39, 0.88)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff" }}
                formatter={(v: any, k: string) => {
                  if (k === "vol") return [Number(v).toLocaleString(), "Volume"];
                  if (k === "c") return [fmtNum(Number(v)), "Close"];
                  if (k === "o") return [fmtNum(Number(v)), "Open"];
                  if (k === "h") return [fmtNum(Number(v)), "High"];
                  if (k === "l") return [fmtNum(Number(v)), "Low"];
                  return [fmtNum(Number(v)), k.toUpperCase()];
                }}
                labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
              />
              {candles.some((c) => c.vol != null) && <Bar yAxisId="right" dataKey="vol" fill="rgba(255,255,255,0.18)" maxBarSize={10} />}

              {/* SAFE Customized candlesticks (guards prevent “can't convert undefined to object”) */}
              <Customized
                yAxisId="left"
                component={(props: any) => {
                  const { xAxisMap, yAxisMap, displayedData } = props || {};
                  if (!xAxisMap || !yAxisMap || !displayedData || displayedData.length === 0) return null;

                  const xKey = Object.keys(xAxisMap)[0];
                  const yKey = Object.keys(yAxisMap)[0];
                  if (!xKey || !yKey) return null;

                  const xScale = xAxisMap[xKey]?.scale;
                  const yScale = yAxisMap[yKey]?.scale;
                  if (!xScale || !yScale) return null;

                  let width = 6;
                  if (displayedData.length > 1) {
                    const x0 = xScale(displayedData[0]?.t);
                    const x1 = xScale(displayedData[1]?.t);
                    if (Number.isFinite(x0) && Number.isFinite(x1)) width = Math.max(4, Math.abs(x1 - x0) * 0.7);
                  }

                  return (
                    <g>
                      {displayedData.map((d: Candle, i: number) => {
                        const x = xScale(d.t) - width / 2;
                        const color = d.c >= d.o ? "#eab308" : "#f472b6";
                        const yBodyTop = yScale(Math.min(d.o, d.c));
                        const yBodyBottom = yScale(Math.max(d.o, d.c));
                        const yWickTop = yScale(d.h);
                        const yWickBottom = yScale(d.l);

                        return (
                          <g key={i}>
                            <line x1={x + width / 2} x2={x + width / 2} y1={yWickTop} y2={yWickBottom} stroke={color} strokeWidth={1.4} />
                            <rect
                              x={x}
                              y={yBodyTop}
                              width={width}
                              height={Math.max(1, yBodyBottom - yBodyTop)}
                              fill={color}
                              opacity={0.95}
                              rx={2}
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                }}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Holdings table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-white/70">
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
            {isLoading && <tr><td colSpan={6} className="py-6 text-center text-white/70">Loading…</td></tr>}
            {isError && <tr><td colSpan={6} className="py-6 text-center text-rose-300">Failed to load portfolio.</td></tr>}
            {!isLoading && !isError && (data?.holdings ?? []).length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-white/70">No holdings yet.</td></tr>
            )}

            {(data?.holdings ?? []).map((h: CryptoHolding) => {
              const pnl = h.pnl ?? 0;
              const pnlPct = h.pnlPct ?? null;
              const pnlColor = pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-white/70";
              return (
                <React.Fragment key={h._id}>
                  <tr className={"border-b border-white/10 hover:bg-white/[0.06] transition " + (selectedHoldingId === h._id ? "bg-white/[0.06]" : "")}>
                    <td className="py-2 pr-2 cursor-pointer" onClick={() => setSelectedHoldingId(h._id)}>
                      <div className="font-medium">{h.symbol || h.name}</div>
                      <div className="text-xs text-white/60">{h.name}</div>
                    </td>
                    <td className="py-2 px-2 text-right">{fmtNum(h.quantity)}</td>
                    <td className="py-2 px-2 text-right">{fmtMoney(h.price)}</td>
                    <td className="py-2 px-2 text-right font-medium">{fmtMoney(h.value)}</td>
                    <td className={"py-2 px-2 text-right font-medium " + pnlColor}>
                      {pnl >= 0 ? "+" : ""}{fmtMoney(pnl)}
                      {pnlPct != null && <span className="text-white/50"> ({pnlPct >= 0 ? "+" : ""}{Number(pnlPct).toFixed(2)}%)</span>}
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openNewLot(h._id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10" title="Add lot">
                          <PlusIcon className="h-4 w-4" /> Lot
                        </button>
                        <button onClick={() => openEditHolding(h)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10" title="Edit holding">
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {Array.isArray(h.lots) && h.lots.length > 0 && (
                    <tr className="border-b border-white/10">
                      <td colSpan={6} className="bg-white/[0.04]">
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
        onSave={(payload) => upsert.mutate(payload, { onSuccess: () => setHoldingModal({ open: false }) })}
      />
      <LotFormModal
        open={lotModal.open}
        holdingId={lotModal.holdingId!}
        initial={lotModal.initial}
        onClose={() => setLotModal({ open: false })}
        onSave={(lot) => {
          if (lot._id) {
            updateLot.mutate(
              { id: lotModal.holdingId!, lotId: String(lot._id), purchasedAt: lot.purchasedAt, quantity: lot.quantity!, unitCostUSD: lot.unitCostUSD, note: lot.note },
              { onSuccess: () => setLotModal({ open: false }) }
            );
          } else {
            addLot.mutate(
              { id: lotModal.holdingId!, purchasedAt: lot.purchasedAt, quantity: lot.quantity!, unitCostUSD: lot.unitCostUSD, note: lot.note },
              { onSuccess: () => setLotModal({ open: false }) }
            );
          }
        }}
      />
    </Card>
  );
}

/* ------------------------ Small bits reused above ------------------------ */
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
      <div className="text-xs text-white/70 mb-2">Lots</div>
      <div className="rounded-xl overflow-hidden ring-1 ring-white/10 bg-white/[0.05]">
        <table className="min-w-full text-xs">
          <thead className="text-white/70">
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
                    {l.pnlPct != null && <span className="text-white/50"> ({l.pnlPct >= 0 ? "+" : ""}{Number(l.pnlPct).toFixed(2)}%)</span>}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onInlineEdit(l)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10">
                        <PencilSquareIcon className="h-4 w-4" /> Edit
                      </button>
                      <button onClick={() => onDelete(String(l._id))} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 ring-1 ring-rose-400/30 text-rose-200">
                        <TrashIcon className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(lots ?? []).length === 0 && (
              <tr><td colSpan={7} className="py-3 text-center text-white/70">No lots yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Forms ------------------------------- */
function HoldingFormModal({
  open, initial, onClose, onSave,
}: { open: boolean; initial?: Partial<CryptoHolding>; onClose: () => void; onSave: (payload: any) => void; }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [cgId, setCgId] = useState(initial?.cgId ?? "");
  const qty = useCommaNumber(initial?.quantity != null ? String(initial.quantity) : "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");

  useEffect(() => {
    setName(initial?.name ?? ""); setSymbol(initial?.symbol ?? ""); setCgId(initial?.cgId ?? "");
    qty.setRaw(initial?.quantity != null ? String(initial.quantity) : ""); setAccountId(initial?.accountId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?._id, kind: "crypto", source: "manual",
      accountScope: accountId ? "account" : "global",
      accountId: accountId || null, name, symbol, cgId: cgId || null, quantity: qty.value,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?._id ? "Edit Holding" : "Add Holding"}>
      <form onSubmit={submit} className="grid gap-3">
        <L label="Name"><I value={name} onChange={(e) => setName(e.target.value)} placeholder="Bitcoin" /></L>
        <L label="Symbol"><I value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" /></L>
        <L label="CoinGecko ID"><I value={cgId} onChange={(e) => setCgId(e.target.value)} placeholder="bitcoin" /></L>
        <L label="Quantity"><I value={qty.raw} onChange={qty.onChange} placeholder="0.50" /><span className="text-xs text-white/50 mt-1">We’ll compute value using live price.</span></L>
        <L label="Account ID (optional)"><I value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="acc_123" /></L>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15">Cancel</button>
          <button type="submit" className="px-3 py-2 rounded-lg bg-white text-black hover:opacity-90">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function LotFormModal({
  open, holdingId, initial, onClose, onSave,
}: { open: boolean; holdingId: string; initial?: Partial<CryptoLot>; onClose: () => void; onSave: (lot: Partial<CryptoLot> & { _id?: string }) => void; }) {
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
    if (!qty.value || qty.value <= 0) return alert("Quantity must be > 0");
    onSave({
      _id: initial?._id ? String(initial._id) : undefined,
      purchasedAt: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
      quantity: qty.value, unitCostUSD: unit.value, note: note?.trim() || undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?._id ? "Edit Lot" : "Add Lot"}>
      <form onSubmit={submit} className="grid gap-3">
        <L label="Purchase Date"><input type="date" className="bg-white/10 rounded-lg px-3 py-2 ring-1 ring-white/10" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Quantity"><I value={qty.raw} onChange={qty.onChange} placeholder="0.25" /></L>
          <L label="Unit Cost (USD, optional)"><I value={unit.raw} onChange={unit.onChange} placeholder="62000" /></L>
        </div>
        <L label="Note (optional)"><I value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bought after pullback" /></L>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15">Cancel</button>
          <button type="submit" className="px-3 py-2 rounded-lg bg-white text-black hover:opacity-90">Save</button>
        </div>
      </form>
    </Modal>
  );
}

/* tiny form primitives */
function L({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return <div className="grid gap-1"><label className="text-xs text-white/70">{label}</label>{children}</div>;
}
function I(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={"bg-white/10 rounded-lg px-3 py-2 ring-1 ring-white/10 " + (props.className ?? "")} />;
}
