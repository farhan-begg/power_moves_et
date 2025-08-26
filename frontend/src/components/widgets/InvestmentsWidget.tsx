// src/components/widgets/plaid/InvestmentsWidget.tsx
import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks/hooks";
import { fetchInvestments } from "../../features/plaid/plaidSlice";

export default function InvestmentsWidget() {
  const dispatch = useAppDispatch();
  const { holdings, totalValue, loading, error } = useAppSelector(s => s.plaid);
  const refresh = () => dispatch(fetchInvestments());

  useEffect(() => { if (!holdings.length) refresh(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">Investments</h3>
        <button onClick={refresh} className="text-xs underline" disabled={loading}>Refresh</button>
      </div>
      {error && <div className="text-xs text-red-300 mb-2">{error}</div>}
      <div className="text-sm mb-2">Total: {totalValue.toFixed(2)}</div>
      {holdings.length ? (
        <ul className="text-xs space-y-1 max-h-40 overflow-auto">
          {holdings.map((h: any, i: number) => (
            <li key={i} className="flex justify-between">
              <span>{h.ticker || h.name || h.securityId}</span>
              <span>{(h.value ?? 0).toFixed(2)} {h.isoCurrencyCode || ""}</span>
            </li>
          ))}
        </ul>
      ) : (!loading && !error) ? <div className="text-xs opacity-70">No holdings (Sandbox can return empty).</div> : null}
    </div>
  );
}
