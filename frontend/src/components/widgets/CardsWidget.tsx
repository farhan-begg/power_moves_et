import { useAppDispatch, useAppSelector } from "../../hooks/hooks";
import { fetchCards } from "../../features/plaid/plaidSlice";


export default function CardsWidget() {
  const dispatch = useAppDispatch();
  const { cards } = useAppSelector((s) => s.plaid);

  return (
    <div className="p-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-medium">Credit cards</h3>
        <button onClick={() => dispatch(fetchCards())} className="text-xs px-2 py-1 border rounded-lg">Refresh</button>
      </div>
      {!cards.length && <div className="text-sm opacity-70">No cards yet.</div>}
      <ul className="space-y-2">
        {cards.map((c) => (
          <li key={c.accountId} className="border border-white/10 rounded-lg p-2">
            <div className="font-medium">{c.name} {c.mask ? `• • • • ${c.mask}` : ""}</div>
            <div className="text-sm opacity-90">
              Balance: {c.currentBalance != null
                ? new Intl.NumberFormat(undefined, { style: "currency", currency: c.isoCurrencyCode ?? "USD" }).format(c.currentBalance)
                : "—"}
            </div>
            {c.nextPaymentDueDate && <div className="text-xs opacity-70">Next due: {c.nextPaymentDueDate}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
