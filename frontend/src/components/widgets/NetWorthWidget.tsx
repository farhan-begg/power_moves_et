import { useAppDispatch, useAppSelector } from '../../hooks/hooks'
import { fetchAllPlaid } from "../../features/plaid/plaidSlice";
export default function NetWorthWidget() {
  const dispatch = useAppDispatch();
  const { netWorth, loading } = useAppSelector((s) => s.plaid);

  return (
    <div className="p-3 space-y-2">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Net worth</h3>
        <button onClick={() => dispatch(fetchAllPlaid())} className="text-xs px-2 py-1 border rounded-lg">
          Refresh
        </button>
      </div>
      {loading && <div className="opacity-70 text-sm">Loading…</div>}
      {!loading && !netWorth && <div className="opacity-70 text-sm">Link accounts to compute net worth.</div>}
      {netWorth && (
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Metric label="Assets" val={netWorth.summary.assets} cur={netWorth.currencyHint} />
          <Metric label="Debts" val={netWorth.summary.debts} cur={netWorth.currencyHint} />
          <Metric label="Net" val={netWorth.summary.netWorth} cur={netWorth.currencyHint} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, val, cur }: { label: string; val: number; cur: string }) {
  return (
    <div className="rounded-lg border border-white/10 p-2">
      <div className="text-xs opacity-70">{label}</div>
      <div className="font-semibold">{new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(val)}</div>
    </div>
  );
}
