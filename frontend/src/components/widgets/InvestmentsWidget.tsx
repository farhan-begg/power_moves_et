import { useAppDispatch, useAppSelector } from "../../hooks/hooks";
import { fetchInvestments } from "../../features/plaid/plaidSlice";

export default function InvestmentsWidget() {
  const dispatch = useAppDispatch();
  const { holdings } = useAppSelector((s) => s.plaid);

  return (
    <div className="p-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-medium">Investments</h3>
        <button onClick={() => dispatch(fetchInvestments())} className="text-xs px-2 py-1 border rounded-lg">Refresh</button>
      </div>
      {!holdings.length && <div className="text-sm opacity-70">No holdings yet (Sandbox often returns none).</div>}
      {!!holdings.length && (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-70">
              <tr><th className="py-1">Ticker</th><th className="py-1">Name</th><th className="py-1">Qty</th><th className="py-1">Value</th></tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <tr key={`${h.accountId}-${h.securityId}`} className="border-t border-white/10">
                  <td className="py-1">{h.ticker ?? "—"}</td>
                  <td className="py-1">{h.name ?? "—"}</td>
                  <td className="py-1">{h.quantity ?? 0}</td>
                  <td className="py-1">
                    {new Intl.NumberFormat(undefined, { style: "currency", currency: h.isoCurrencyCode ?? "USD" })
                      .format(h.value ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
