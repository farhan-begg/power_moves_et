import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts, PlaidAccount } from "../../api/plaid";
import { fetchTransactions, Transaction } from "../../api/transaction";
import { lastNDaysISO, money } from "./_utils";
import { BanknotesIcon, BuildingLibraryIcon, CreditCardIcon, ArrowUpRightIcon, ArrowDownRightIcon } from "@heroicons/react/24/outline";

type GroupRow = { key: string; name: string; subtype?: string | null; income: number; expense: number; net: number };

const iconForSubtype = (subtype?: string | null) => {
  const s = (subtype || "").toLowerCase();
  if (s.includes("credit")) return <CreditCardIcon className="h-6 w-6" />;
  if (s.includes("checking") || s.includes("savings")) return <BuildingLibraryIcon className="h-6 w-6" />;
  return <BanknotesIcon className="h-6 w-6" />;
};

export default function BankFlowWidget() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const { startDate, endDate } = React.useMemo(() => lastNDaysISO(30), []);

  // ✅ Explicitly type the result as an array
  const { data: accounts = [], isLoading: accLoading } = useQuery<PlaidAccount[]>({
    queryKey: ["plaid", "accounts"],
    queryFn: () => fetchPlaidAccounts(token),
    enabled: !!token,
  });

  const { data: txPage, isLoading, isError } = useQuery({
    queryKey: ["transactions", startDate, endDate, "bank-flow"],
    queryFn: () => fetchTransactions(token, { startDate, endDate, page: 1, limit: 500, source: "plaid" }),
    enabled: !!token,
  });
  const transactions: Transaction[] = txPage?.transactions ?? [];

  const accMap = React.useMemo(() => {
    const m = new Map<string, { name: string; subtype?: string | null }>();
    accounts.forEach((a) => {
      const id = (a as any).account_id ?? a.accountId; // tolerate either shape
      m.set(id, { name: a.name || a.officialName || a.subtype || "Account", subtype: a.subtype || null });
    });
    return m;
  }, [accounts]);

  const supportsAccountId = transactions.some((t: any) => "accountId" in t || "account_id" in t);

  const grouped: GroupRow[] = React.useMemo(() => {
    const buckets = new Map<string, { name: string; subtype?: string | null; income: number; expense: number }>();
    const rows: GroupRow[] = [];

    const getKeyAndName = (t: any) => {
      const accountId = t.accountId || t.account_id;
      if (supportsAccountId && accountId) {
        const meta = accMap.get(accountId);
        return { key: accountId as string, name: meta?.name || "Account", subtype: meta?.subtype };
      }
      return { key: "all", name: "All Accounts", subtype: undefined };
    };

    transactions.forEach((t) => {
      const { key, name, subtype } = getKeyAndName(t);
      const bucket = buckets.get(key) || { name, subtype, income: 0, expense: 0 };
      if (t.type === "income") bucket.income += t.amount;
      else if (t.type === "expense") bucket.expense += t.amount;
      buckets.set(key, bucket);
    });

    buckets.forEach((v, key) => rows.push({ key, name: v.name, subtype: v.subtype, income: v.income, expense: v.expense, net: v.income - v.expense }));

    if (rows.length === 0 && supportsAccountId && accounts.length) {
      accounts.forEach((a) => {
        const id = (a as any).account_id ?? a.accountId;
        rows.push({ key: id, name: a.name || a.officialName || a.subtype || "Account", subtype: a.subtype || undefined, income: 0, expense: 0, net: 0 });
      });
    }

    rows.sort((a, b) => b.expense - a.expense);
    return rows;
  }, [transactions, accMap, supportsAccountId, accounts]);

  if (isLoading || accLoading) return <p className="text-white/70">Loading…</p>;
  if (isError) return <p className="text-rose-300">Failed to load bank flow.</p>;

  return (
    <div className="flex flex-col divide-y divide-white/10">
      {grouped.map((g) => {
        const netPos = g.net >= 0;
        return (
          <div key={g.key} className="py-3 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-white/10 ${netPos ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
              {iconForSubtype(g.subtype)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium truncate">{g.name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/20 text-emerald-300">
                  <ArrowUpRightIcon className="h-4 w-4" /> In: <span className="font-mono tabular-nums">{money(g.income)}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-400/10 ring-1 ring-rose-400/20 text-rose-300">
                  <ArrowDownRightIcon className="h-4 w-4" /> Out: <span className="font-mono tabular-nums">{money(g.expense)}</span>
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-base font-semibold font-mono tabular-nums ${netPos ? "text-emerald-300" : "text-rose-300"}`}>
                {netPos ? "+" : "-"}{money(Math.abs(g.net))}
              </div>
              <div className="text-xs text-white/60">Net</div>
            </div>
          </div>
        );
      })}
      {grouped.length === 0 && <div className="py-6 text-white/70">No data in this range yet.</div>}
    </div>
  );
}
